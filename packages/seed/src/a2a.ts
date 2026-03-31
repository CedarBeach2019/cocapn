/**
 * A2A — agent-to-agent protocol for cocapn.
 *
 * Minimal implementation: discovery, message passing, peer management.
 * Authentication via shared secret (a2a-secret in config or header).
 * Zero dependencies. Uses only Node.js built-ins.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Peer {
  id: string;
  url: string;
  name: string;
  capabilities: string[];
  connectedAt: string;
}

export interface A2AMessage {
  from: string;
  to: string;
  content: string;
  type: 'greeting' | 'question' | 'knowledge-share' | 'task-request' | 'status';
  ts?: string;
}

export interface HandshakeRequest {
  id: string;
  name: string;
  url: string;
  capabilities: string[];
  secret?: string;
}

export interface A2AResponse {
  ok: boolean;
  reply?: string;
  error?: string;
}

// ─── A2A Hub ───────────────────────────────────────────────────────────────────

export class A2AHub {
  private peers: Map<string, Peer> = new Map();
  private secret: string;
  private agentName: string;
  private agentUrl: string;

  constructor(agentName: string, agentUrl: string, secret: string) {
    this.agentName = agentName;
    this.agentUrl = agentUrl;
    this.secret = secret;
  }

  /** Validate a shared secret */
  authenticate(provided: string | undefined): boolean {
    if (!this.secret) return true;
    return provided === this.secret;
  }

  /** Register a peer from a handshake */
  addPeer(req: HandshakeRequest): Peer {
    const peer: Peer = {
      id: req.id,
      url: req.url,
      name: req.name,
      capabilities: req.capabilities ?? [],
      connectedAt: new Date().toISOString(),
    };
    this.peers.set(req.id, peer);
    return peer;
  }

  /** Remove a peer */
  removePeer(id: string): boolean {
    return this.peers.delete(id);
  }

  /** Get all known peers */
  getPeers(): Peer[] {
    return [...this.peers.values()];
  }

  /** Get a specific peer */
  getPeer(id: string): Peer | undefined {
    return this.peers.get(id);
  }

  /** Initiate a handshake with another agent */
  async connect(targetUrl: string): Promise<Peer | null> {
    try {
      const res = await fetch(`${targetUrl}/api/a2a/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.agentName,
          name: this.agentName,
          url: this.agentUrl,
          capabilities: ['chat', 'knowledge-share'],
          secret: this.secret,
        } satisfies HandshakeRequest),
      });
      if (!res.ok) return null;
      const data = await res.json() as { peer: HandshakeRequest };
      return this.addPeer(data.peer);
    } catch {
      return null;
    }
  }

  /** Send a message to a peer */
  async sendMessage(peerId: string, content: string, type: A2AMessage['type'] = 'greeting'): Promise<A2AResponse> {
    const peer = this.peers.get(peerId);
    if (!peer) return { ok: false, error: `Unknown peer: ${peerId}` };

    const msg: A2AMessage = {
      from: this.agentName, to: peer.name, content, type,
      ts: new Date().toISOString(),
    };
    try {
      const res = await fetch(`${peer.url}/api/a2a/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-A2A-Secret': this.secret },
        body: JSON.stringify(msg),
      });
      return await res.json() as A2AResponse;
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /** Build A2A context for system prompt */
  visitorPrompt(): string {
    if (this.peers.size === 0) return '';
    const names = [...this.peers.values()].map(p => p.name).join(', ');
    return `\n\n## Visiting Agents\nConnected peers: ${names}. Be helpful but don't share private facts (prefixed with private.*).`;
  }

  /** Load secret from file */
  static loadSecret(repoDir: string): string {
    const p = join(repoDir, 'cocapn', 'a2a-secret.json');
    if (existsSync(p)) {
      try {
        const data = JSON.parse(readFileSync(p, 'utf-8')) as { secret: string };
        return data.secret ?? '';
      } catch { /* fall through */ }
    }
    return process.env.COCAPN_A2A_SECRET ?? '';
  }
}
