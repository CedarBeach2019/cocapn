/**
 * ModeSwitcher — detects the agent's operating mode from request context.
 *
 * Modes determine what data the agent can access and what tools are available:
 *
 *   - public:      External origin, no auth, path starts with /api/public/
 *   - private:     WebSocket with valid auth token
 *   - maintenance: Cron trigger or heartbeat
 *   - a2a:         Request with Fleet-JWT header
 *
 * Each mode maps to an AccessScope that defines visibility and allowed tools.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentMode = "public" | "private" | "maintenance" | "a2a";

/** Describes what a given mode can see and do. */
export interface AccessScope {
  mode: AgentMode;
  /** Whether private facts (private.* keys) are visible. */
  canSeePrivateFacts: boolean;
  /** Whether raw wiki pages are accessible (vs sanitized excerpts). */
  canSeeRawWiki: boolean;
  /** Whether task descriptions include full implementation details. */
  canSeeRawTasks: boolean;
  /** Whether agent can write/modify memory. */
  canWriteMemory: boolean;
  /** Whether agent can execute shell commands. */
  canExecuteShell: boolean;
  /** Whether agent can make outbound network requests. */
  canAccessNetwork: boolean;
  /** Allowed tool categories. */
  allowedTools: string[];
}

/** Context extracted from an incoming request for mode detection. */
export interface RequestContext {
  /** HTTP path (e.g. "/api/public/status", "/ws", "/api/a2a/message") */
  path: string;
  /** Origin header or undefined for same-origin / WebSocket */
  origin?: string;
  /** Authorization header value (Bearer token or raw JWT) */
  authorization?: string;
  /** Custom Fleet-JWT header */
  fleetJwt?: string;
  /** Whether this request came from a cron/scheduler trigger */
  isCronTrigger?: boolean;
  /** Whether this is a heartbeat / health-check request */
  isHeartbeat?: boolean;
  /** Whether the bridge is in maintenance mode */
  maintenanceMode?: boolean;
}

// ─── Access scopes per mode ───────────────────────────────────────────────────

const SCOPES: Record<AgentMode, AccessScope> = {
  public: {
    mode: "public",
    canSeePrivateFacts: false,
    canSeeRawWiki: false,
    canSeeRawTasks: false,
    canWriteMemory: false,
    canExecuteShell: false,
    canAccessNetwork: false,
    allowedTools: ["search", "status", "profile"],
  },
  private: {
    mode: "private",
    canSeePrivateFacts: true,
    canSeeRawWiki: true,
    canSeeRawTasks: true,
    canWriteMemory: true,
    canExecuteShell: true,
    canAccessNetwork: true,
    allowedTools: ["*"],
  },
  maintenance: {
    mode: "maintenance",
    canSeePrivateFacts: true,
    canSeeRawWiki: true,
    canSeeRawTasks: true,
    canWriteMemory: true,
    canExecuteShell: true,
    canAccessNetwork: true,
    allowedTools: ["admin", "health", "gc", "sync", "backup"],
  },
  a2a: {
    mode: "a2a",
    canSeePrivateFacts: false,
    canSeeRawWiki: false,
    canSeeRawTasks: false,
    canWriteMemory: false,
    canExecuteShell: false,
    canAccessNetwork: false,
    allowedTools: ["search", "status", "a2a:message", "a2a:heartbeat"],
  },
};

// ─── ModeSwitcher ─────────────────────────────────────────────────────────────

export class ModeSwitcher {
  /**
   * Detect the agent mode from a request context.
   *
   * Priority order:
   *   1. maintenance (cron trigger, heartbeat, or global maintenance flag)
   *   2. a2a (Fleet-JWT header present)
   *   3. private (valid auth token via Authorization header)
   *   4. public (everything else)
   */
  detectMode(ctx: RequestContext): AgentMode {
    // 1. Maintenance mode takes priority
    if (ctx.isCronTrigger || ctx.isHeartbeat || ctx.maintenanceMode) {
      return "maintenance";
    }

    // 2. A2A: request carries a Fleet-JWT header
    if (ctx.fleetJwt) {
      return "a2a";
    }

    // 3. Private: authenticated WebSocket connection
    if (ctx.authorization) {
      return "private";
    }

    // 4. Public path prefix check (even without other signals)
    if (ctx.path.startsWith("/api/public/")) {
      return "public";
    }

    // Default: treat unknown as public (least privilege)
    return "public";
  }

  /**
   * Get the access scope for a given mode.
   */
  getScope(mode: AgentMode): AccessScope {
    return SCOPES[mode];
  }

  /**
   * Detect mode and return the access scope in one call.
   */
  resolve(ctx: RequestContext): AccessScope {
    const mode = this.detectMode(ctx);
    return this.getScope(mode);
  }

  /**
   * Check whether a specific tool is allowed in the given mode.
   */
  isToolAllowed(mode: AgentMode, tool: string): boolean {
    const scope = this.getScope(mode);
    if (scope.allowedTools.includes("*")) return true;
    return scope.allowedTools.includes(tool);
  }
}
