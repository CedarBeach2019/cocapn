import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';

import {
  isExpired,
  priorityValue,
  type A2AMessage,
  type A2AMessageType,
  type A2AConfig,
} from '../../src/protocols/a2a/types.js';
import { A2AClient } from '../../src/protocols/a2a/index.js';
import { A2AHandler } from '../../src/protocols/a2a/handler.js';
import { LocalTransport, MessageBus } from '../../src/protocols/a2a/transport.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<A2AConfig> = {}): A2AConfig {
  return {
    agentId: randomUUID(),
    peers: {},
    heartbeatInterval: 0, // disable heartbeat for most tests
    maxMessageSize: 1_000_000,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<A2AMessage> = {}): A2AMessage {
  return {
    id: randomUUID(),
    from: 'agent-a',
    to: 'agent-b',
    type: 'task',
    payload: { data: 'test' },
    timestamp: Date.now(),
    ...overrides,
  };
}

// ─── Types ───────────────────────────────────────────────────────────────────

describe('a2a/types', () => {
  it('isExpired returns false when no TTL', () => {
    expect(isExpired(makeMessage())).toBe(false);
  });

  it('isExpired returns false when TTL not exceeded', () => {
    expect(isExpired(makeMessage({ ttl: 60_000 }))).toBe(false);
  });

  it('isExpired returns true when TTL exceeded', () => {
    const msg = makeMessage({ ttl: 1000, timestamp: Date.now() - 2000 });
    expect(isExpired(msg)).toBe(true);
  });

  it('priorityValue orders correctly', () => {
    expect(priorityValue('low')).toBeLessThan(priorityValue('normal'));
    expect(priorityValue('normal')).toBeLessThan(priorityValue('high'));
    expect(priorityValue('high')).toBeLessThan(priorityValue('critical'));
    expect(priorityValue(undefined)).toBe(priorityValue('normal'));
  });
});

// ─── Message Bus ─────────────────────────────────────────────────────────────

describe('MessageBus', () => {
  let bus: MessageBus;

  beforeEach(() => {
    bus = new MessageBus();
  });

  it('delivers to specific agent', () => {
    const received: A2AMessage[] = [];
    bus.subscribe('agent-b', (msg) => received.push(msg));

    const msg = makeMessage({ to: 'agent-b' });
    bus.deliver(msg);

    expect(received).toHaveLength(1);
    expect(received[0]!.id).toBe(msg.id);
  });

  it('broadcast delivers to all except sender', () => {
    const received: A2AMessage[] = [];
    bus.subscribe('agent-a', (msg) => received.push(msg));
    bus.subscribe('agent-b', (msg) => received.push(msg));
    bus.subscribe('agent-c', (msg) => received.push(msg));

    bus.deliver(makeMessage({ from: 'agent-a', to: 'broadcast' }));

    // agent-a (sender) should not receive its own broadcast
    expect(received).toHaveLength(2);
    expect(received.map(m => m.to === 'broadcast')).toEqual([true, true]);
  });

  it('does not deliver to unsubscribed agent', () => {
    const received: A2AMessage[] = [];
    bus.subscribe('agent-b', (msg) => received.push(msg));
    bus.unsubscribe('agent-b');

    bus.deliver(makeMessage({ to: 'agent-b' }));
    expect(received).toHaveLength(0);
  });

  it('tracks message count', () => {
    bus.deliver(makeMessage());
    bus.deliver(makeMessage());
    expect(bus.getMessageCount()).toBe(2);
  });

  it('reset clears state', () => {
    bus.subscribe('agent-b', () => {});
    bus.deliver(makeMessage());
    bus.reset();
    expect(bus.getMessageCount()).toBe(0);
  });
});

// ─── Local Transport ─────────────────────────────────────────────────────────

describe('LocalTransport', () => {
  let bus: MessageBus;
  let transportA: LocalTransport;
  let transportB: LocalTransport;

  beforeEach(async () => {
    bus = new MessageBus();
    transportA = new LocalTransport('agent-a', bus);
    transportB = new LocalTransport('agent-b', bus);
    await transportA.start();
    await transportB.start();
  });

  it('delivers messages between agents', async () => {
    const received: A2AMessage[] = [];
    transportB.onMessage((msg) => received.push(msg));

    const msg = makeMessage({ from: 'agent-a', to: 'agent-b' });
    await transportA.send(msg);

    expect(received).toHaveLength(1);
    expect(received[0]!.from).toBe('agent-a');
  });

  it('shares the same bus', () => {
    expect(transportA.getBus()).toBe(transportB.getBus());
  });

  it('stop removes subscriber', async () => {
    const received: A2AMessage[] = [];
    transportB.onMessage((msg) => received.push(msg));
    await transportB.stop();

    const msg = makeMessage({ from: 'agent-a', to: 'agent-b' });
    await transportA.send(msg);

    expect(received).toHaveLength(0);
  });
});

// ─── Handler ─────────────────────────────────────────────────────────────────

describe('A2AHandler', () => {
  let handler: A2AHandler;

  beforeEach(() => {
    handler = new A2AHandler();
  });

  it('routes by message type', async () => {
    const received: A2AMessage[] = [];
    handler.on('task', (msg) => received.push(msg));

    const msg = makeMessage({ type: 'task' });
    const handled = await handler.handle(msg);

    expect(handled).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('does not handle unmatched types', async () => {
    const handled = await handler.handle(makeMessage({ type: 'query' }));
    expect(handled).toBe(false);
  });

  it('catch-all handles unmatched types', async () => {
    const received: A2AMessage[] = [];
    handler.onAny((msg) => received.push(msg));

    const handled = await handler.handle(makeMessage({ type: 'query' }));
    expect(handled).toBe(true);
    expect(received).toHaveLength(1);
  });

  it('drops expired messages', async () => {
    handler.on('task', () => { throw new Error('should not be called'); });

    const msg = makeMessage({ ttl: 1000, timestamp: Date.now() - 2000 });
    const handled = await handler.handle(msg);

    expect(handled).toBe(false);
    expect(handler.getDroppedExpired()).toBe(1);
  });

  it('typed handler takes priority over catch-all', async () => {
    const typed: A2AMessage[] = [];
    const catchAll: A2AMessage[] = [];
    handler.on('task', (msg) => typed.push(msg));
    handler.onAny((msg) => catchAll.push(msg));

    await handler.handle(makeMessage({ type: 'task' }));

    expect(typed).toHaveLength(1);
    expect(catchAll).toHaveLength(0);
  });

  it('off removes handler', async () => {
    handler.on('task', () => {});
    handler.off('task');

    const handled = await handler.handle(makeMessage({ type: 'task' }));
    expect(handled).toBe(false);
  });

  describe('reply handling', () => {
    it('resolves on matching replyTo', async () => {
      const replyPromise = handler.expectReply('msg-1', 5000);

      const reply = makeMessage({ replyTo: 'msg-1', payload: { result: 'ok' } });
      await handler.handle(reply);

      await expect(replyPromise).resolves.toEqual({ result: 'ok' });
      expect(handler.getPendingReplyCount()).toBe(0);
    });

    it('rejects on timeout', async () => {
      const replyPromise = handler.expectReply('msg-1', 50);

      await expect(replyPromise).rejects.toThrow('timed out');
      expect(handler.getPendingReplyCount()).toBe(0);
    });

    it('rejectAllPending rejects all', async () => {
      const p1 = handler.expectReply('msg-1', 5000).catch(() => {});
      const p2 = handler.expectReply('msg-2', 5000).catch(() => {});

      handler.rejectAllPending('shutdown');

      expect(handler.getPendingReplyCount()).toBe(0);
      // Ensure promises settle
      await Promise.allSettled([p1, p2]);
    });
  });
});

// ─── A2A Client ──────────────────────────────────────────────────────────────

describe('A2AClient', () => {
  it('creates with default local transport', () => {
    const client = new A2AClient(makeConfig());
    expect(client).toBeDefined();
  });

  it('send creates and delivers a message', async () => {
    const bus = new MessageBus();
    const clientA = new A2AClient(
      makeConfig({ agentId: 'agent-a', heartbeatInterval: 0 }),
      new LocalTransport('agent-a', bus),
    );
    const clientB = new A2AClient(
      makeConfig({ agentId: 'agent-b', heartbeatInterval: 0 }),
      new LocalTransport('agent-b', bus),
    );

    const received: A2AMessage[] = [];
    clientB.on('task', (msg) => received.push(msg));

    await clientA.start();
    await clientB.start();

    await clientA.send('agent-b', 'task', { action: 'scan' });

    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ action: 'scan' });
    expect(received[0]!.from).toBe('agent-a');

    await clientA.stop();
    await clientB.stop();
  });

  it('broadcast reaches all peers', async () => {
    const bus = new MessageBus();
    const sender = new A2AClient(
      makeConfig({ agentId: 'sender', heartbeatInterval: 0 }),
      new LocalTransport('sender', bus),
    );
    const receiver1 = new A2AClient(
      makeConfig({ agentId: 'recv-1', heartbeatInterval: 0 }),
      new LocalTransport('recv-1', bus),
    );
    const receiver2 = new A2AClient(
      makeConfig({ agentId: 'recv-2', heartbeatInterval: 0 }),
      new LocalTransport('recv-2', bus),
    );

    const received: A2AMessage[] = [];
    receiver1.on('event', (msg) => received.push(msg));
    receiver2.on('event', (msg) => received.push(msg));

    await sender.start();
    await receiver1.start();
    await receiver2.start();

    await sender.broadcast('event', { species: 'salmon' });

    expect(received).toHaveLength(2);
    // Both should have the same payload
    expect(received[0]!.payload).toEqual({ species: 'salmon' });
    expect(received[1]!.payload).toEqual({ species: 'salmon' });

    await sender.stop();
    await receiver1.stop();
    await receiver2.stop();
  });

  it('request/reply pattern (clean)', async () => {
    const bus = new MessageBus();
    const reqTransport = new LocalTransport('requester', bus);
    const resTransport = new LocalTransport('responder', bus);

    const requester = new A2AClient(
      makeConfig({ agentId: 'requester', heartbeatInterval: 0 }),
      reqTransport,
    );
    const responder = new A2AClient(
      makeConfig({ agentId: 'responder', heartbeatInterval: 0 }),
      resTransport,
    );

    await requester.start();
    await responder.start();

    // Responder replies to queries
    responder.on('query', async (msg) => {
      // Send reply — we need the replyTo to be in the message sent through transport
      const replyMsg: A2AMessage = {
        id: randomUUID(),
        from: 'responder',
        to: msg.from,
        type: 'query',
        payload: { answer: 42 },
        timestamp: Date.now(),
        replyTo: msg.id,
      };
      // Use the responder's transport to send the reply back
      await resTransport.send(replyMsg);
    });

    // Requester sends a query and waits for reply
    const result = await requester.request('responder', 'query', { question: 'life' }, 2000);

    expect(result).toEqual({ answer: 42 });

    await requester.stop();
    await responder.stop();
  });

  it('request times out', async () => {
    const bus = new MessageBus();
    const client = new A2AClient(
      makeConfig({ agentId: 'loner', heartbeatInterval: 0 }),
      new LocalTransport('loner', bus),
    );
    await client.start();

    await expect(
      client.request('nobody', 'query', {}, 50),
    ).rejects.toThrow('timed out');

    await client.stop();
  });

  it('getStatus tracks counters', async () => {
    const bus = new MessageBus();
    const client = new A2AClient(
      makeConfig({ agentId: 'test', heartbeatInterval: 0, peers: { a: 'http://a', b: 'http://b' } }),
      new LocalTransport('test', bus),
    );
    await client.start();

    // Send a message
    await client.broadcast('heartbeat', {});

    const status = client.getStatus();
    expect(status.peers).toBe(2);
    expect(status.messagesSent).toBe(1);

    await client.stop();
  });

  it('updatePeers adds and removes peers', async () => {
    const client = new A2AClient(
      makeConfig({ agentId: 'test', peers: { a: 'http://a' } }),
    );

    expect(client.getStatus().peers).toBe(1);

    client.updatePeers({ b: 'http://b' });
    expect(client.getStatus().peers).toBe(2);

    client.removePeer('a');
    expect(client.getStatus().peers).toBe(1);
  });

  it('heartbeat sends at interval', async () => {
    vi.useFakeTimers();
    const bus = new MessageBus();
    const received: A2AMessage[] = [];

    const client = new A2AClient(
      makeConfig({ agentId: 'hb-sender', heartbeatInterval: 1000 }),
      new LocalTransport('hb-sender', bus),
    );

    const listener = new LocalTransport('listener', bus);
    await client.start();
    await listener.start();
    listener.onMessage((msg) => received.push(msg));

    vi.advanceTimersByTime(3500);

    // Should have 3 heartbeats (at 1000, 2000, 3000)
    expect(received.filter(m => m.type === 'heartbeat')).toHaveLength(3);

    await client.stop();
    await listener.stop();
    vi.useRealTimers();
  });

  it('start is idempotent', async () => {
    const client = new A2AClient(makeConfig());
    await client.start();
    await client.start(); // second call should be no-op
    await client.stop();
  });

  it('stop is idempotent', async () => {
    const client = new A2AClient(makeConfig());
    await client.stop(); // should not throw
    await client.stop();
  });
});

// ─── Message Routing ─────────────────────────────────────────────────────────

describe('message routing', () => {
  it('routes task messages to task handler', async () => {
    const handler = new A2AHandler();
    const tasks: A2AMessage[] = [];
    handler.on('task', (msg) => tasks.push(msg));

    await handler.handle(makeMessage({ type: 'task', payload: { action: 'deploy' } }));
    await handler.handle(makeMessage({ type: 'event', payload: { alert: 'fire' } }));

    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.payload).toEqual({ action: 'deploy' });
  });

  it('routes telemetry messages', async () => {
    const handler = new A2AHandler();
    const telemetry: A2AMessage[] = [];
    handler.on('telemetry', (msg) => telemetry.push(msg));

    await handler.handle(makeMessage({
      type: 'telemetry',
      payload: { temperature: 72, humidity: 0.45 },
    }));

    expect(telemetry).toHaveLength(1);
    expect(telemetry[0]!.payload).toEqual({ temperature: 72, humidity: 0.45 });
  });

  it('routes handoff messages', async () => {
    const handler = new A2AHandler();
    const handoffs: A2AMessage[] = [];
    handler.on('handoff', (msg) => handoffs.push(msg));

    await handler.handle(makeMessage({
      type: 'handoff',
      payload: { context: 'user-session-123', reason: 'escalation' },
    }));

    expect(handoffs).toHaveLength(1);
    expect(handoffs[0]!.payload).toEqual({ context: 'user-session-123', reason: 'escalation' });
  });

  it('multiple handlers for different types', async () => {
    const handler = new A2AHandler();
    const tasks: string[] = [];
    const events: string[] = [];

    handler.on('task', (msg) => tasks.push(msg.id));
    handler.on('event', (msg) => events.push(msg.id));

    const taskMsg = makeMessage({ type: 'task' });
    const eventMsg = makeMessage({ type: 'event' });

    await handler.handle(taskMsg);
    await handler.handle(eventMsg);

    expect(tasks).toEqual([taskMsg.id]);
    expect(events).toEqual([eventMsg.id]);
  });
});

// ─── TTL Expiration ──────────────────────────────────────────────────────────

describe('TTL expiration', () => {
  it('handler drops expired messages', async () => {
    const handler = new A2AHandler();
    const received: A2AMessage[] = [];
    handler.on('task', (msg) => received.push(msg));

    const expired = makeMessage({ ttl: 500, timestamp: Date.now() - 1000 });
    const fresh = makeMessage({ ttl: 5000, timestamp: Date.now() });

    expect(await handler.handle(expired)).toBe(false);
    expect(await handler.handle(fresh)).toBe(true);

    expect(received).toHaveLength(1);
    expect(handler.getDroppedExpired()).toBe(1);
  });

  it('messages without TTL never expire', async () => {
    const handler = new A2AHandler();
    const received: A2AMessage[] = [];
    handler.on('event', (msg) => received.push(msg));

    // Very old message but no TTL
    const old = makeMessage({ type: 'event', timestamp: Date.now() - 999_999_999 });
    expect(await handler.handle(old)).toBe(true);
    expect(received).toHaveLength(1);
  });
});
