/**
 * Cloud Connector — manages connection between local bridge and cloud worker.
 *
 * Features:
 * - Health check via /api/health
 * - Task submission to cloud worker
 * - Task result polling
 * - Automatic heartbeat loop
 * - Connection status events
 * - Fleet JWT authentication
 */

import { signJwt } from '../security/jwt.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudConnectorConfig {
  /** Full HTTPS URL of the cloud worker (e.g., https://cocapn-agent.example.workers.dev) */
  workerUrl: string;
  /** Fleet JWT secret for authentication (shared with cloud worker) */
  fleetJwtSecret: string;
  /** Bridge instance ID for heartbeat */
  instanceId: string;
  /** Bridge mode: local (no cloud), cloud (all cloud), hybrid (auto-route) */
  bridgeMode: 'local' | 'cloud' | 'hybrid';
  /** Heartbeat interval in milliseconds (default: 30000) */
  heartbeatInterval?: number;
}

export interface CloudStatus {
  connected: boolean;
  workerUrl: string;
  lastHeartbeat: number | null;
  latency: number | null;
  tasksQueued: number;
  tasksCompleted: number;
  error?: string;
}

export interface TaskSubmitRequest {
  type: string;
  payload: unknown;
}

export interface TaskSubmitResponse {
  taskId: string;
  status: string;
}

export interface TaskResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  log: string[];
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
}

// ─── CloudConnector ───────────────────────────────────────────────────────────────

export class CloudConnector {
  private config: Required<Omit<CloudConnectorConfig, 'fleetJwtSecret' | 'instanceId'>> & Pick<CloudConnectorConfig, 'fleetJwtSecret' | 'instanceId'>;
  private status: CloudStatus;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private statusListeners: Set<(status: CloudStatus) => void> = new Set();
  private pendingTasks: Map<string, TaskResult> = new Map();
  private tasksCompleted = 0;

  constructor(config: CloudConnectorConfig) {
    this.config = {
      ...config,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
    };

    this.status = {
      connected: false,
      workerUrl: this.config.workerUrl,
      lastHeartbeat: null,
      latency: null,
      tasksQueued: 0,
      tasksCompleted: 0,
    };
  }

  // ── Connection Management ──────────────────────────────────────────────────────

  /**
   * Check if the cloud worker is reachable.
   * Returns true if the worker responds with a healthy status.
   */
  async ping(): Promise<boolean> {
    const startTime = Date.now();
    try {
      const health = await this.fetchHealth();
      const latency = Date.now() - startTime;

      const isHealthy = health.status === 'healthy' || health.status === 'degraded';

      this.status = {
        ...this.status,
        connected: isHealthy,
        latency,
        lastHeartbeat: Date.now(),
        error: undefined,
      };

      this.notifyStatusChange();
      return isHealthy;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.status = {
        ...this.status,
        connected: false,
        latency: null,
        lastHeartbeat: Date.now(),
        error,
      };
      this.notifyStatusChange();
      return false;
    }
  }

  /**
   * Get the current connection status.
   */
  async getStatus(): Promise<CloudStatus> {
    // Refresh status if we haven't checked recently
    if (!this.status.lastHeartbeat || Date.now() - this.status.lastHeartbeat > this.config.heartbeatInterval) {
      await this.ping();
    }
    return { ...this.status };
  }

  // ── Task Management ────────────────────────────────────────────────────────────

  /**
   * Submit a task to the cloud worker for execution.
   * Returns the task ID if submission succeeds.
   */
  async submitTask(task: TaskSubmitRequest): Promise<TaskSubmitResponse> {
    const jwt = this.generateJwt();

    try {
      const response = await fetch(`${this.config.workerUrl}/api/execute-task`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(task),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Task submission failed: ${response.status} ${error}`);
      }

      const result = await response.json() as TaskSubmitResponse;

      // Track the pending task
      this.pendingTasks.set(result.taskId, {
        taskId: result.taskId,
        status: result.status as TaskResult['status'],
        log: [],
      });

      this.status.tasksQueued = this.pendingTasks.size;
      this.notifyStatusChange();

      return result;
    } catch (err) {
      throw new Error(`Task submission failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Get the result of a previously submitted task.
   * Polls the cloud worker for the current status.
   */
  async getTaskResult(taskId: string): Promise<TaskResult> {
    const jwt = this.generateJwt();

    try {
      const response = await fetch(`${this.config.workerUrl}/api/tasks/status/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Task result fetch failed: ${response.status} ${error}`);
      }

      const result = await response.json() as TaskResult;

      // Update local tracking
      const existing = this.pendingTasks.get(taskId);
      if (existing) {
        if (result.status === 'completed' || result.status === 'failed') {
          this.pendingTasks.delete(taskId);
          this.tasksCompleted++;
          this.status.tasksQueued = this.pendingTasks.size;
          this.status.tasksCompleted = this.tasksCompleted;
          this.notifyStatusChange();
        } else {
          this.pendingTasks.set(taskId, result);
        }
      }

      return result;
    } catch (err) {
      throw new Error(`Task result fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Submit a task and poll for completion.
   * Returns the final task result when complete or failed.
   */
  async submitTaskAndWait(task: TaskSubmitRequest, options: {
    pollInterval?: number;
    timeout?: number;
  } = {}): Promise<TaskResult> {
    const { pollInterval = 1000, timeout = 300000 } = options;

    const submitResult = await this.submitTask(task);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.getTaskResult(submitResult.taskId);

      if (result.status === 'completed' || result.status === 'failed') {
        return result;
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Task ${submitResult.taskId} timed out after ${timeout}ms`);
  }

  // ── Heartbeat Management ───────────────────────────────────────────────────────

  /**
   * Start the automatic heartbeat loop.
   * Sends a heartbeat request every heartbeatInterval.
   * Posts to /api/heartbeat to report local agent status.
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) {
      this.stopHeartbeat();
    }

    // Initial ping + heartbeat
    void this.pingAndHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      void this.pingAndHeartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop the automatic heartbeat loop.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Ping health endpoint and send heartbeat in parallel.
   */
  private async pingAndHeartbeat(): Promise<void> {
    await Promise.allSettled([
      this.ping(),
      this.sendHeartbeat(),
    ]);
  }

  /**
   * POST heartbeat to cloud worker to report local agent status.
   */
  private async sendHeartbeat(): Promise<void> {
    const jwt = this.generateJwt();

    try {
      const response = await fetch(`${this.config.workerUrl}/api/heartbeat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId: this.config.instanceId,
          bridgeMode: this.config.bridgeMode,
          tunnelActive: false, // Tunnel status tracked separately
          version: '0.2.0',
        }),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => '');
        console.warn(`[CloudConnector] Heartbeat POST failed: ${response.status} ${error}`);
      }
    } catch (err) {
      // Non-fatal — cloud may be temporarily unreachable
      console.warn(`[CloudConnector] Heartbeat POST error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Event Listeners ────────────────────────────────────────────────────────────

  /**
   * Register a callback for connection status changes.
   */
  onStatusChange(callback: (status: CloudStatus) => void): void {
    this.statusListeners.add(callback);
  }

  /**
   * Unregister a status change callback.
   */
  offStatusChange(callback: (status: CloudStatus) => void): void {
    this.statusListeners.delete(callback);
  }

  // ── Internal Helpers ───────────────────────────────────────────────────────────

  private async fetchHealth(): Promise<HealthCheckResponse> {
    const response = await fetch(`${this.config.workerUrl}/api/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }

    return response.json() as Promise<HealthCheckResponse>;
  }

  private generateJwt(): string {
    return signJwt(
      {
        sub: this.config.instanceId,
        dom: 'cocapn',
      },
      this.config.fleetJwtSecret,
      { ttlSeconds: 3600 }
    );
  }

  private notifyStatusChange(): void {
    const statusCopy = { ...this.status };
    const listeners = Array.from(this.statusListeners);
    for (const listener of listeners) {
      try {
        listener(statusCopy);
      } catch (err) {
        console.error('[CloudConnector] Status listener error:', err);
      }
    }
  }

  // ── Hybrid Mode Decision Logic ───────────────────────────────────────────────────

  /**
   * Decide whether to execute a task locally or in the cloud.
   * Used in hybrid mode to route tasks based on complexity and cost.
   */
  shouldRunLocally(task: TaskSubmitRequest): boolean {
    if (this.config.bridgeMode === 'local') {
      return true;
    }

    if (this.config.bridgeMode === 'cloud') {
      return false;
    }

    // Hybrid mode: decide based on task type
    switch (task.type) {
      // Quick tasks stay local
      case 'chat':
      case 'status':
      case 'fact_get':
      case 'fact_set':
        return true;

      // Heavy tasks go to cloud
      case 'tree_search':
      case 'browser_automation':
      case 'knowledge_graph':
      case 'vector_search':
      case 'code_generation':
        return false;

      // Default to local for unknown tasks
      default:
        return true;
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  /**
   * Clean up resources when the connector is no longer needed.
   */
  destroy(): void {
    this.stopHeartbeat();
    this.statusListeners.clear();
    this.pendingTasks.clear();
  }
}
