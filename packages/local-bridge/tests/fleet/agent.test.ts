/**
 * Fleet Agent tests — two bridges coordinate on tasks via WebSocket.
 *
 * Tests the full lifecycle:
 *   1. Leader creates a fleet
 *   2. Worker joins the fleet
 *   3. Leader submits a task (with subtasks)
 *   4. Workers execute subtasks and return results
 *   5. Leader merges results
 *   6. Task status is queryable
 *   7. Shutdown cleans up
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { FleetAgent } from '../../src/fleet/agent.js';
import type { FleetTask, FleetTaskResult } from '../../src/fleet/agent.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick a free port by binding to port 0 and letting the OS assign one.
 */
async function getFreePort(): Promise<number> {
  const { createServer } = await import('net');
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr) {
        srv.close(() => resolve(addr.port));
      } else {
        srv.close(() => reject(new Error('Failed to get port')));
      }
    });
  });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('FleetAgent', () => {
  let leaderPort: number;
  let leader: FleetAgent;
  let worker1: FleetAgent;
  let worker2: FleetAgent;

  beforeAll(async () => {
    leaderPort = await getFreePort();
  });

  beforeEach(() => {
    leader = new FleetAgent({
      bridgePort: leaderPort,
      agentId: 'leader-1',
      agentName: 'Leader Agent',
      role: 'leader',
      skills: ['orchestrate'],
    });

    worker1 = new FleetAgent({
      bridgePort: 0, // worker doesn't need its own port
      agentId: 'worker-1',
      agentName: 'Worker Alpha',
      role: 'worker',
      skills: ['research', 'code-review'],
    });

    worker2 = new FleetAgent({
      bridgePort: 0,
      agentId: 'worker-2',
      agentName: 'Worker Beta',
      role: 'worker',
      skills: ['testing', 'code-review'],
    });
  });

  afterEach(async () => {
    await leader.shutdown();
    await worker1.shutdown();
    await worker2.shutdown();
  });

  // ── Fleet creation ────────────────────────────────────────────────────────

  describe('createFleet', () => {
    it('creates a fleet and returns fleet ID + port', async () => {
      const result = await leader.createFleet();
      expect(result.fleetId).toBeDefined();
      expect(typeof result.fleetId).toBe('string');
      expect(result.port).toBeGreaterThan(0);
    });

    it('generates a unique fleet ID', async () => {
      const result = await leader.createFleet();
      expect(leader.getFleetId()).toBe(result.fleetId);
      expect(result.fleetId).toHaveLength(36); // UUID format
    });

    it('throws if a worker tries to create a fleet', async () => {
      const worker = new FleetAgent({
        bridgePort: 0,
        agentId: 'w',
        agentName: 'W',
        role: 'worker',
      });
      await expect(worker.createFleet()).rejects.toThrow('Only the leader can create a fleet');
      await worker.shutdown();
    });
  });

  // ── Worker join ──────────────────────────────────────────────────────────

  describe('joinFleet', () => {
    it('worker joins the fleet and receives agents list', async () => {
      const { port: fleetPort } = await leader.createFleet();

      const joinPromise = worker1.joinFleet(`ws://localhost:${fleetPort}`);
      const result = await joinPromise;

      expect(result.fleetId).toBe(leader.getFleetId());
      expect(result.role).toBe('worker');
      expect(result.agents).toBeDefined();
      expect(result.agents.length).toBe(1);
      expect(result.agents[0].id).toBe('worker-1');
    });

    it('multiple workers join the fleet', async () => {
      const { port: fleetPort } = await leader.createFleet();

      await worker1.joinFleet(`ws://localhost:${fleetPort}`);
      await worker2.joinFleet(`ws://localhost:${fleetPort}`);

      const agents = await leader.listAgents();
      expect(agents.length).toBe(2);
      expect(agents.map(a => a.id).sort()).toEqual(['worker-1', 'worker-2']);
    });

    it('throws if leader tries to join a fleet', async () => {
      await expect(leader.joinFleet('ws://localhost:9999')).rejects.toThrow('Only workers can join');
    });
  });

  // ── Heartbeat ────────────────────────────────────────────────────────────

  describe('heartbeat', () => {
    it('worker sends heartbeat and gets ack', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);

      // Start heartbeat with short interval
      worker1.startHeartbeat(100);

      // Wait a couple heartbeat cycles
      await new Promise(resolve => setTimeout(resolve, 250));

      // Leader should have seen the heartbeat (worker status updated)
      const agents = await leader.listAgents();
      expect(agents.length).toBe(1);
      expect(agents[0].lastHeartbeat).toBeGreaterThan(0);
    });

    it('heartbeat stops on shutdown', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);
      worker1.startHeartbeat(100);

      await worker1.shutdown();
      // Give time for any pending heartbeat to fail
      await new Promise(resolve => setTimeout(resolve, 150));
      // No error thrown means cleanup succeeded
    });
  });

  // ── Task submission & execution ──────────────────────────────────────────

  describe('task lifecycle', () => {
    it('single task assigned to worker and result returned', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);

      // Register task handler on worker
      worker1.onTask(async (task: FleetTask): Promise<FleetTaskResult> => {
        return {
          taskId: task.id,
          status: 'success',
          output: { answer: 42 },
          duration: 10,
        };
      });

      // Submit a task without subtasks — goes to single worker
      const taskId = await leader.submitTask({
        type: 'test-task',
        payload: { question: 'ultimate answer' },
      });

      expect(taskId).toBeDefined();

      // Wait for worker to process
      await new Promise(resolve => setTimeout(resolve, 200));

      // Check task status
      const task = await leader.getTaskStatus(taskId);
      expect(task).not.toBeNull();
      expect(task!.status).toBe('completed');
      expect(task!.result).toEqual({ answer: 42 });
    });

    it('task with subtasks distributed to multiple workers', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);
      await worker2.joinFleet(`ws://localhost:${fleetPort}`);

      // Register task handlers
      worker1.onTask(async (task: FleetTask): Promise<FleetTaskResult> => {
        const desc = (task.payload as any)?.description || '';
        return {
          taskId: task.id,
          status: 'success',
          output: `[Worker-1] ${desc}`,
          duration: 10,
        };
      });

      worker2.onTask(async (task: FleetTask): Promise<FleetTaskResult> => {
        const desc = (task.payload as any)?.description || '';
        return {
          taskId: task.id,
          status: 'success',
          output: `[Worker-2] ${desc}`,
          duration: 10,
        };
      });

      // Submit task with two subtasks
      const taskId = await leader.submitTask({
        type: 'multi-research',
        payload: { topic: 'fleet protocol' },
        subtasks: [
          { id: 'sub-1', description: 'Research fleet protocol design' },
          { id: 'sub-2', description: 'Research existing implementations' },
        ],
        mergeStrategy: 'concat',
      });

      expect(taskId).toBeDefined();

      // Wait for workers to process
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check parent task status
      const task = await leader.getTaskStatus(taskId);
      expect(task).not.toBeNull();
      expect(task!.status).toBe('completed');
      expect(task!.result).toBeDefined();

      // Merged result should contain both worker outputs
      const result = task!.result as string;
      expect(result).toContain('[Worker-1]');
      expect(result).toContain('[Worker-2]');
    });

    it('task fails when no workers available', async () => {
      await leader.createFleet();
      // No workers joined

      const taskId = await leader.submitTask({
        type: 'test-task',
        payload: {},
      });

      const task = await leader.getTaskStatus(taskId);
      expect(task).not.toBeNull();
      expect(task!.status).toBe('failed');
      expect((task!.result as any)?.error).toBeDefined();
    });

    it('worker returns failure on error', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);

      worker1.onTask(async (): Promise<FleetTaskResult> => {
        throw new Error('Something went wrong');
      });

      const taskId = await leader.submitTask({
        type: 'error-task',
        payload: {},
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const task = await leader.getTaskStatus(taskId);
      expect(task).not.toBeNull();
      expect(task!.status).toBe('failed');
    });

    it('worker without handler returns failure', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);
      // No onTask registered on worker

      const taskId = await leader.submitTask({
        type: 'test-task',
        payload: {},
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      const task = await leader.getTaskStatus(taskId);
      expect(task).not.toBeNull();
      expect(task!.status).toBe('failed');
    });
  });

  // ── Task status queries ──────────────────────────────────────────────────

  describe('getTaskStatus', () => {
    it('returns null for non-existent task', async () => {
      const status = await leader.getTaskStatus('nonexistent-id');
      expect(status).toBeNull();
    });
  });

  // ── List agents ──────────────────────────────────────────────────────────

  describe('listAgents', () => {
    it('returns empty array when no workers', async () => {
      await leader.createFleet();
      const agents = await leader.listAgents();
      expect(agents).toEqual([]);
    });

    it('returns joined workers', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);
      await worker2.joinFleet(`ws://localhost:${fleetPort}`);

      const agents = await leader.listAgents();
      expect(agents.length).toBe(2);
    });
  });

  // ── Shutdown ─────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('leader shuts down cleanly and closes worker connections', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);

      await leader.shutdown();

      // Worker should be disconnected
      const agents = await leader.listAgents();
      expect(agents).toEqual([]);
    });

    it('worker shuts down cleanly', async () => {
      const { port: fleetPort } = await leader.createFleet();
      await worker1.joinFleet(`ws://localhost:${fleetPort}`);

      await worker1.shutdown();

      // Leader should no longer list the worker
      await new Promise(resolve => setTimeout(resolve, 100));
      const agents = await leader.listAgents();
      expect(agents).toEqual([]);
    });
  });

  // ── Full integration: two agents coordinate ──────────────────────────────

  describe('full coordination', () => {
    it('end-to-end: leader creates fleet, workers join, task is split, results merged', async () => {
      // 1. Create fleet
      const { port: fleetPort } = await leader.createFleet();
      expect(leader.getFleetId()).toBeDefined();

      // 2. Workers join
      const w1Result = await worker1.joinFleet(`ws://localhost:${fleetPort}`);
      expect(w1Result.fleetId).toBe(leader.getFleetId());

      const w2Result = await worker2.joinFleet(`ws://localhost:${fleetPort}`);
      expect(w2Result.fleetId).toBe(leader.getFleetId());

      // 3. List agents
      const agents = await leader.listAgents();
      expect(agents.length).toBe(2);

      // 4. Workers register handlers
      worker1.onTask(async (task: FleetTask): Promise<FleetTaskResult> => {
        return {
          taskId: task.id,
          status: 'success',
          output: `Result from Alpha: ${(task.payload as any)?.description}`,
          duration: 5,
        };
      });

      worker2.onTask(async (task: FleetTask): Promise<FleetTaskResult> => {
        return {
          taskId: task.id,
          status: 'success',
          output: `Result from Beta: ${(task.payload as any)?.description}`,
          duration: 5,
        };
      });

      // 5. Submit coordinated task
      const taskId = await leader.submitTask({
        type: 'code-review',
        payload: { files: ['main.ts', 'utils.ts'] },
        subtasks: [
          { id: 'review-1', description: 'Review main.ts for bugs', payload: { file: 'main.ts' } },
          { id: 'review-2', description: 'Review utils.ts for bugs', payload: { file: 'utils.ts' } },
        ],
        mergeStrategy: 'concat',
      });

      // 6. Wait for completion
      await new Promise(resolve => setTimeout(resolve, 300));

      // 7. Verify merged result
      const task = await leader.getTaskStatus(taskId);
      expect(task).not.toBeNull();
      expect(task!.status).toBe('completed');
      const result = task!.result as string;
      expect(result).toContain('Result from Alpha');
      expect(result).toContain('Result from Beta');

      // 8. Shutdown
      await leader.shutdown();
      await worker1.shutdown();
      await worker2.shutdown();
    });
  });
});
