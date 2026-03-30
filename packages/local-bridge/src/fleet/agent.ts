/**
 * FleetAgent — makes a bridge instance a fleet participant.
 *
 * Two modes:
 *   - **Leader**: creates a fleet, accepts worker connections, distributes tasks.
 *   - **Worker**: connects to a leader via WebSocket, receives tasks, returns results.
 *
 * Communication is direct WebSocket (no cloud dependency).  The leader tracks
 * fleet state in-memory.  Task splitting reuses the existing TaskSplitter from
 * the fleet protocol package.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import type {
  FleetTask,
  FleetAgent as FleetAgentInfo,
  TaskStatus,
  TaskSplitResult,
  MergeResult,
  FleetRole,
  AgentStatus,
} from '../../../protocols/src/fleet/types.js';
import { TaskSplitter } from '../../../protocols/src/fleet/task-splitter.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FleetAgentConfig {
  /** Port this bridge instance is listening on */
  bridgePort: number;
  /** Unique ID for this agent in the fleet */
  agentId: string;
  /** Human-readable name */
  agentName: string;
  /** 'leader' creates a fleet, 'worker' joins one */
  role: 'leader' | 'worker';
  /** Optional pre-existing fleet ID (leader generates one if absent) */
  fleetId?: string;
  /** Skills this agent can perform */
  skills?: string[];
}

export interface FleetTaskResult {
  taskId: string;
  status: 'success' | 'failure' | 'partial';
  output: unknown;
  duration: number;
}

/** Task submitted from the outside into the fleet. */
export interface TaskSubmission {
  type: string;
  payload: unknown;
  /** Parallel subtask descriptions — leader assigns each to a worker */
  subtasks?: Array<{ id: string; description: string; payload?: unknown }>;
  /** Merge strategy for collecting results (default: 'concat') */
  mergeStrategy?: 'concat' | 'vote' | 'quorum' | 'custom';
}

// ─── Wire protocol (JSON frames over WS) ─────────────────────────────────────

type WireFrame =
  | { type: 'fleet/join';       agentId: string; agentName: string; skills: string[]; role: FleetRole }
  | { type: 'fleet/joined';     fleetId: string; agentId: string; role: FleetRole; agents: FleetAgentInfo[] }
  | { type: 'fleet/reject';     reason: string }
  | { type: 'fleet/heartbeat';  agentId: string; status: AgentStatus; load: number }
  | { type: 'fleet/ack_heartbeat' }
  | { type: 'fleet/submit_task'; taskId: string; task: TaskSubmission }
  | { type: 'fleet/task_status'; taskId: string }
  | { type: 'fleet/list_agents' }
  | { type: 'fleet/task_assign'; task: FleetTask }
  | { type: 'fleet/task_result'; taskId: string; result: FleetTaskResult }
  | { type: 'fleet/task_status_response'; task: FleetTask | null }
  | { type: 'fleet/list_agents_response'; agents: FleetAgentInfo[] }
  | { type: 'fleet/agent_left'; agentId: string }
  | { type: 'fleet/final_result'; taskId: string; result: MergeResult };

// ─── FleetAgent ───────────────────────────────────────────────────────────────

export class FleetAgent extends EventEmitter {
  private config: FleetAgentConfig;
  private fleetId: string;
  private role: FleetRole;
  private splitter: TaskSplitter;

  // Leader state
  private server: WebSocketServer | null = null;
  private workers: Map<string, { ws: WebSocket; info: FleetAgentInfo }> = new Map();
  private tasks: Map<string, FleetTask> = new Map();
  private pendingSubtasks: Map<string, { remaining: number; results: Array<{ subtaskId: string; result: unknown }>; mergeStrategy: string; resolve: (r: MergeResult) => void; parentTask: FleetTask }> = new Map();
  private workerOrder: string[] = [];

  // Worker state
  private leaderWs: WebSocket | null = null;
  private taskCallback: ((task: FleetTask) => Promise<FleetTaskResult>) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: FleetAgentConfig) {
    super();
    this.config = config;
    this.fleetId = config.fleetId || randomUUID();
    this.role = config.role;
    this.splitter = new TaskSplitter();
  }

  // ── Leader lifecycle ──────────────────────────────────────────────────────

  /** Create a new fleet — starts a dedicated WebSocket server for fleet comms. */
  async createFleet(): Promise<{ fleetId: string; port: number }> {
    if (this.config.role !== 'leader') {
      throw new Error('Only the leader can create a fleet');
    }

    // Fleet WS listens on bridgePort + 2 (bridgePort+1 is HTTP peer API)
    const fleetPort = this.config.bridgePort + 2;

    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ port: fleetPort });

      this.server.on('listening', () => {
        console.info(`[fleet] Leader ${this.config.agentId} listening on ws://localhost:${fleetPort} (fleet ${this.fleetId})`);
        resolve({ fleetId: this.fleetId, port: fleetPort });
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.on('connection', (ws) => {
        this.handleLeaderConnection(ws);
      });
    });
  }

  // ── Worker lifecycle ──────────────────────────────────────────────────────

  /** Join an existing fleet by connecting to the leader. */
  async joinFleet(leaderUrl: string): Promise<{ fleetId: string; role: string; agents: FleetAgentInfo[] }> {
    if (this.config.role !== 'worker') {
      throw new Error('Only workers can join a fleet');
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(leaderUrl);
      this.leaderWs = ws;

      ws.on('open', () => {
        const joinMsg: WireFrame = {
          type: 'fleet/join',
          agentId: this.config.agentId,
          agentName: this.config.agentName,
          skills: this.config.skills || [],
          role: 'worker',
        };
        ws.send(JSON.stringify(joinMsg));
      });

      ws.on('message', (data) => {
        const frame = JSON.parse(data.toString()) as WireFrame;

        switch (frame.type) {
          case 'fleet/joined':
            this.fleetId = frame.fleetId;
            this.role = frame.role;
            this.emit('joined', { fleetId: frame.fleetId, agents: frame.agents });
            resolve({ fleetId: frame.fleetId, role: frame.role, agents: frame.agents });
            break;

          case 'fleet/reject':
            reject(new Error(frame.reason));
            break;

          case 'fleet/task_assign':
            this.handleTaskAssignment(frame.task).catch(err => {
              console.error('[fleet] Task execution error:', err);
            });
            break;

          default:
            // Ignore other frames for now
            break;
        }
      });

      ws.on('close', () => {
        this.leaderWs = null;
        this.stopHeartbeat();
        this.emit('disconnected');
      });

      ws.on('error', (err) => {
        reject(err);
      });
    });
  }

  // ── Task submission (leader only) ─────────────────────────────────────────

  /** Submit a task to the fleet. Returns the task ID. */
  async submitTask(task: TaskSubmission): Promise<string> {
    if (this.role !== 'leader') {
      throw new Error('Only the leader can submit tasks');
    }

    const taskId = randomUUID();
    const parentTask: FleetTask = {
      id: taskId,
      fleetId: this.fleetId,
      status: 'pending',
      type: task.type,
      payload: task.payload,
      priority: 5,
      createdAt: Date.now(),
      timeout: 300000,
      retryCount: 0,
      onTimeout: 'warn',
    };

    this.tasks.set(taskId, parentTask);

    // If subtasks are provided, use them directly
    if (task.subtasks && task.subtasks.length > 0) {
      await this.distributeSubtasks(taskId, task.subtasks, task.mergeStrategy || 'concat');
    } else {
      // No subtasks — assign the whole task to a single worker
      await this.assignToSingleWorker(parentTask);
    }

    return taskId;
  }

  /** Get the current status of a task. */
  async getTaskStatus(taskId: string): Promise<FleetTask | null> {
    return this.tasks.get(taskId) ?? null;
  }

  /** List all agents in the fleet. */
  async listAgents(): Promise<FleetAgentInfo[]> {
    if (this.role === 'leader') {
      return Array.from(this.workers.values()).map(w => w.info);
    }
    return [];
  }

  // ── Task callback (worker only) ───────────────────────────────────────────

  /** Register a callback for tasks assigned by the leader. */
  onTask(callback: (task: FleetTask) => Promise<FleetTaskResult>): void {
    this.taskCallback = callback;
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  startHeartbeat(intervalMs: number = 30000): void {
    if (this.heartbeatTimer) this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.leaderWs && this.leaderWs.readyState === WebSocket.OPEN) {
        const frame: WireFrame = {
          type: 'fleet/heartbeat',
          agentId: this.config.agentId,
          status: 'idle',
          load: 0,
        };
        this.leaderWs.send(JSON.stringify(frame));
      }
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    this.stopHeartbeat();

    if (this.leaderWs) {
      this.leaderWs.close();
      this.leaderWs = null;
    }

    if (this.server) {
      for (const [_, worker] of this.workers) {
        worker.ws.close();
      }
      this.workers.clear();

      await new Promise<void>((resolve, reject) => {
        this.server!.close(err => err ? reject(err) : resolve());
      });
      this.server = null;
    }

    this.tasks.clear();
    this.pendingSubtasks.clear();
    this.removeAllListeners();
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  getFleetId(): string { return this.fleetId; }
  getRole(): FleetRole { return this.role; }
  getAgentId(): string { return this.config.agentId; }

  // ── Leader internals ──────────────────────────────────────────────────────

  private handleLeaderConnection(ws: WebSocket): void {
    let agentId: string | null = null;

    ws.on('message', (data) => {
      const frame = JSON.parse(data.toString()) as WireFrame;

      switch (frame.type) {
        case 'fleet/join': {
          agentId = frame.agentId;
          const info: FleetAgentInfo = {
            id: frame.agentId,
            name: frame.agentName,
            role: frame.role,
            skills: frame.skills,
            status: 'idle',
            instanceUrl: `ws://localhost:${(ws as any)._socket?.remotePort ?? 0}`,
            lastHeartbeat: Date.now(),
            load: 0,
            successRate: 1,
            uptime: 0,
          };

          this.workers.set(frame.agentId, { ws, info });
          this.workerOrder.push(frame.agentId);

          const agents = Array.from(this.workers.values()).map(w => w.info);
          const response: WireFrame = {
            type: 'fleet/joined',
            fleetId: this.fleetId,
            agentId: frame.agentId,
            role: frame.role,
            agents,
          };
          ws.send(JSON.stringify(response));
          this.emit('worker-joined', info);
          console.info(`[fleet] Worker ${frame.agentId} joined fleet ${this.fleetId}`);
          break;
        }

        case 'fleet/heartbeat': {
          if (agentId && this.workers.has(agentId)) {
            const worker = this.workers.get(agentId)!;
            worker.info.lastHeartbeat = Date.now();
            worker.info.status = frame.status;
            worker.info.load = frame.load;
            const ack: WireFrame = { type: 'fleet/ack_heartbeat' };
            ws.send(JSON.stringify(ack));
          }
          break;
        }

        case 'fleet/task_result': {
          this.handleWorkerResult(frame.taskId, frame.result);
          break;
        }

        default:
          break;
      }
    });

    ws.on('close', () => {
      if (agentId) {
        this.workers.delete(agentId);
        this.workerOrder = this.workerOrder.filter(id => id !== agentId);
        this.emit('worker-left', agentId);
        console.info(`[fleet] Worker ${agentId} left fleet ${this.fleetId}`);
      }
    });
  }

  private async distributeSubtasks(
    parentTaskId: string,
    subtaskDefs: Array<{ id: string; description: string; payload?: unknown }>,
    mergeStrategy: string,
  ): Promise<void> {
    const parent = this.tasks.get(parentTaskId)!;
    parent.status = 'assigned';

    // Create subtask entries and track them
    const subtaskIds: string[] = [];
    const availableWorkers = this.workerOrder.filter(id => this.workers.has(id));

    if (availableWorkers.length === 0) {
      parent.status = 'failed';
      parent.result = { error: 'No workers available' };
      return;
    }

    for (let i = 0; i < subtaskDefs.length; i++) {
      const workerId = availableWorkers[i % availableWorkers.length]!;
      const subtaskDef = subtaskDefs[i]!;
      const subtaskId = subtaskDef.id || `${parentTaskId}-sub-${i}`;

      const subtask: FleetTask = {
        id: subtaskId,
        parentId: parentTaskId,
        fleetId: this.fleetId,
        assignedTo: workerId,
        status: 'assigned',
        type: 'subtask',
        payload: {
          description: subtaskDef.description,
          data: subtaskDef.payload,
        },
        priority: parent.priority,
        createdAt: Date.now(),
        timeout: parent.timeout,
        retryCount: 0,
        onTimeout: 'warn',
      };

      this.tasks.set(subtaskId, subtask);
      subtaskIds.push(subtaskId);

      // Send assignment to worker
      const worker = this.workers.get(workerId);
      if (worker) {
        const frame: WireFrame = { type: 'fleet/task_assign', task: subtask };
        worker.ws.send(JSON.stringify(frame));
      }
    }

    // Track pending subtask results
    this.pendingSubtasks.set(parentTaskId, {
      remaining: subtaskIds.length,
      results: [],
      mergeStrategy,
      resolve: () => {}, // placeholder
      parentTask: parent,
    });
  }

  private async assignToSingleWorker(task: FleetTask): Promise<void> {
    const availableWorkers = this.workerOrder.filter(id => this.workers.has(id));

    if (availableWorkers.length === 0) {
      task.status = 'failed';
      task.result = { error: 'No workers available' };
      return;
    }

    const workerId = availableWorkers[0]!;
    task.assignedTo = workerId;
    task.status = 'assigned';

    const worker = this.workers.get(workerId)!;
    if (worker) {
      const frame: WireFrame = { type: 'fleet/task_assign', task };
      worker.ws.send(JSON.stringify(frame));
    }
  }

  private handleWorkerResult(taskId: string, result: FleetTaskResult): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    if (result.status === 'success') {
      task.status = 'completed';
      task.result = result.output;
      task.completedAt = Date.now();
    } else {
      task.status = 'failed';
      task.result = { error: 'Task failed', details: result.output };
      task.completedAt = Date.now();
    }

    // If this is a subtask, check if parent is done
    if (task.parentId) {
      const pending = this.pendingSubtasks.get(task.parentId)!;
      if (pending) {
        pending.results.push({ subtaskId: taskId, result: result.output });
        pending.remaining--;

        if (pending.remaining <= 0) {
          // All subtasks done — merge results
          const merged = this.splitter.mergeResults(pending.results, pending.mergeStrategy as 'concat' | 'vote' | 'quorum' | 'custom');
          pending.parentTask.status = merged.success ? 'completed' : 'failed';
          pending.parentTask.result = merged.result;
          pending.parentTask.completedAt = Date.now();
          this.pendingSubtasks.delete(task.parentId!);
        }
      }
    }
  }

  // ── Worker internals ──────────────────────────────────────────────────────

  private async handleTaskAssignment(task: FleetTask): Promise<void> {
    if (!this.taskCallback) {
      // No callback registered — auto-reject
      this.sendTaskResult(task.id, { taskId: task.id, status: 'failure', output: { error: 'No task handler registered' }, duration: 0 });
      return;
    }

    const startTime = Date.now();
    try {
      const result = await this.taskCallback(task);
      result.duration = Date.now() - startTime;
      this.sendTaskResult(task.id, result);
    } catch (err) {
      this.sendTaskResult(task.id, {
        taskId: task.id,
        status: 'failure',
        output: { error: err instanceof Error ? err.message : String(err) },
        duration: Date.now() - startTime,
      });
    }
  }

  private sendTaskResult(taskId: string, result: FleetTaskResult): void {
    if (this.leaderWs && this.leaderWs.readyState === WebSocket.OPEN) {
      const frame: WireFrame = { type: 'fleet/task_result', taskId, result };
      this.leaderWs.send(JSON.stringify(frame));
    }
  }
}
