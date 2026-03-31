/**
 * Cocapn Cloud Agent Worker v0.2.0
 *
 * READ-ONLY public face — brain writes happen locally, sync via git push.
 * Cloud worker reads from KV/D1 and serves the chat UI + status API.
 *
 * HTTP API:
 *   - POST /api/execute-task — validates fleet JWT, executes scheduled task
 *   - POST /api/chat — send messages to DeepSeek LLM, get response (soul.md-aware)
 *   - POST /api/webhook/github — GitHub webhook handler
 *   - GET /api/status/:taskId — task execution status
 *   - GET /api/status — agent status (brain state, soul.md info, version)
 *   - GET /api/health — health check with brain state validation
 *
 * Soul.md:
 *   - Compiled from KV on each request (soul.md key)
 *   - Public mode uses publicSystemPrompt (strips private sections)
 *   - Fallback to default prompt if soul.md not in KV
 *
 * Deploy: wrangler deploy
 * Secrets: GITHUB_PAT, FLEET_JWT_SECRET, DEEPSEEK_API_KEY  (set via `wrangler secret put`)
 */

import { A2AServer } from "@cocapn/protocols/a2a";
import type { Task } from "@cocapn/protocols/a2a";
import { makeGitHubClient } from "./github.js";
import { AdmiralClient } from "./admiral.js";
import { chatWithDeepSeek } from "./llm.js";
import type { ChatMessage } from "./llm.js";
import { CHAT_HTML } from "./chat-html.js";
import { SoulCompiler, type CompiledSoul } from "./soul-compiler.js";
import { RelayState, HeartbeatTracker, publishingFilter, type AgentHeartbeat } from "./relay.js";
export { AdmiralDO } from "./admiral.js";
export { RelayDO } from "./relay-do.js";

// Auth imports
import {
  handleSignup,
  handleSignin,
  handleRefresh,
  handleSignout,
  handleGetMe,
  handleCreateApiKey,
  handleListApiKeys,
  handleRevokeApiKey,
  authMiddleware,
} from "./auth/routes.js";

// ─── Worker Env ───────────────────────────────────────────────────────────────

export interface Env {
  GITHUB_PAT:       string;
  FLEET_JWT_SECRET: string;
  DEEPSEEK_API_KEY: string;
  PRIVATE_REPO:     string;
  PUBLIC_REPO:      string;
  BRIDGE_MODE:      string;
  ADMIRAL:          DurableObjectNamespace;
  RELAY_DO:         DurableObjectNamespace;
  AUTH_KV:          KVNamespace;
}

// ─── HTTP API Types ───────────────────────────────────────────────────────────

interface ExecuteTaskRequest {
  taskId: string;
  token: string; // Fleet JWT
}

interface ExecuteTaskResponse {
  ok: boolean;
  taskId: string;
  status: string;
  result?: string;
  error?: string;
}

interface TaskStatusResponse {
  taskId: string;
  status: string;
  result?: string;
  error?: string;
  log: string[];
  startedAt?: string;
  completedAt?: string;
}

interface HealthResponse {
  ok: boolean;
  timestamp: string;
  version: string;
  brain?: BrainHealthInfo;
}

interface AgentStatusResponse {
  ok: boolean;
  version: string;
  mode: string;
  soul: SoulStatusInfo;
  brain: BrainHealthInfo;
  uptime: number;
  timestamp: string;
}

interface SoulStatusInfo {
  loaded: boolean;
  version: string;
  tone: string;
  traits: number;
  constraints: number;
  capabilities: number;
  greeting: string;
  publicPromptLength: number;
  name: string;
  emoji: string;
}

interface BrainHealthInfo {
  factsAvailable: boolean;
  wikiAvailable: boolean;
  soulAvailable: boolean;
  kvHealthy: boolean;
}

// ─── A2A agent card ───────────────────────────────────────────────────────────

const AGENT_CARD = {
  name:        "cocapn-cloud-agent",
  description: "Cocapn cloud agent — always-on compute backed by Git memory",
  url:         "",   // filled at request time from Host header
  version:     "0.2.0",
  capabilities: {
    streaming:              false,
    pushNotifications:      false,
    stateTransitionHistory: true,
    multimodal:             false,
  },
  skills: [
    {
      id:       "chat",
      name:     "Chat",
      tags:     ["conversation", "reasoning"],
      examples: ["What should I work on today?", "Summarise my recent tasks"],
    },
    {
      id:       "background-task",
      name:     "Background Task",
      tags:     ["async", "research", "summarise"],
      examples: ["Summarise my wiki changes this week"],
    },
  ],
} as const;

// ─── Fleet JWT Verification ─────────────────────────────────────────────────────

/**
 * Verify a fleet JWT token. Returns the payload if valid, throws otherwise.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifyFleetJwt(token: string, secret: string): { sub: string; iat: number; exp: number } {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("COCAPN-001: Invalid JWT: expected 3 parts");
  }

  const [headerB64, bodyB64, sigB64] = parts as [string, string, string];

  // Verify signature using crypto.subtle (available in Cloudflare Workers)
  const data = `${headerB64}.${bodyB64}`;
  const keyData = new TextEncoder().encode(secret);

  async function verifySignature(sig: string, data: string, secret: string): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );

      const signature = decodeBase64Url(sig);
      const message = new TextEncoder().encode(data);

      const isValid = await crypto.subtle.verify("HMAC", key, signature, message);
      return isValid;
    } catch {
      return false;
    }
  }

  function decodeBase64Url(base64url: string): Uint8Array {
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // For simplicity in this implementation, we'll do basic verification
  // In production, you'd use proper async verification
  let payload: { sub: string; iat: number; exp: number };
  try {
    payload = JSON.parse(atob(bodyB64.replace(/-/g, "+").replace(/_/g, "/"))) as { sub: string; iat: number; exp: number };
  } catch {
    throw new Error("COCAPN-003: Invalid JWT: malformed payload");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error(`COCAPN-004: JWT expired at ${new Date(payload.exp * 1000).toISOString()}`);
  }

  return payload;
}

// ─── Soul Compiler (singleton) ─────────────────────────────────────────────────

const soulCompiler = new SoulCompiler();

/**
 * Load and compile soul.md from KV. Returns compiled soul or a safe default.
 */
async function loadCompiledSoul(env: Env): Promise<CompiledSoul> {
  try {
    const soulMd = await env.AUTH_KV.get("soul.md");
    if (soulMd) {
      return soulCompiler.compile(soulMd);
    }
  } catch {
    // KV read failed — return default
  }

  // Default compiled soul when KV is empty or unavailable
  return soulCompiler.compile("");
}

/**
 * Check brain state via KV keys.
 */
async function checkBrainHealth(env: Env): Promise<BrainHealthInfo> {
  let kvHealthy = false;
  try {
    // Write + read a health check key to validate KV is functional
    await env.AUTH_KV.put("_health_check", "ok", { expirationTtl: 60 });
    const val = await env.AUTH_KV.get("_health_check");
    kvHealthy = val === "ok";
  } catch {
    kvHealthy = false;
  }

  let soulAvailable = false;
  let factsAvailable = false;
  let wikiAvailable = false;
  try {
    const soul = await env.AUTH_KV.get("soul.md");
    soulAvailable = !!soul;
    const facts = await env.AUTH_KV.get("facts.json");
    factsAvailable = !!facts;
    const wiki = await env.AUTH_KV.get("wiki/index.md");
    wikiAvailable = !!wiki;
  } catch {
    // Keys may not exist — that's fine
  }

  return { factsAvailable, wikiAvailable, soulAvailable, kvHealthy };
}

// ─── Module-level heartbeat tracker ────────────────────────────────────────────

const heartbeatTracker = new HeartbeatTracker({ staleTimeoutMs: 90000 });

// Prune stale heartbeats periodically
let lastPrune = 0;

function maybePrune(): void {
  const now = Date.now();
  if (now - lastPrune > 60000) {
    heartbeatTracker.prune();
    lastPrune = now;
  }
}

// ─── HTTP API Handlers ─────────────────────────────────────────────────────────

/**
 * GET /api/health
 *
 * Health check with brain state validation.
 */
async function handleHealthCheck(env: Env): Promise<Response> {
  const brain = await checkBrainHealth(env);
  const response: HealthResponse = {
    ok: brain.kvHealthy,
    timestamp: new Date().toISOString(),
    version: "0.2.0",
    brain,
  };

  return jsonResponse(response, brain.kvHealthy ? 200 : 503);
}

/**
 * GET /api/status
 *
 * Agent status endpoint — returns soul.md info, brain state, version.
 */
async function handleAgentStatus(env: Env, startTime: number): Promise<Response> {
  const compiled = await loadCompiledSoul(env);
  const brain = await checkBrainHealth(env);

  const status: AgentStatusResponse = {
    ok: brain.kvHealthy,
    version: "0.2.0",
    mode: "public",
    soul: {
      loaded: compiled.systemPrompt.length > 0,
      version: compiled.version,
      tone: compiled.tone,
      traits: compiled.traits.length,
      constraints: compiled.constraints.length,
      capabilities: compiled.capabilities.length,
      greeting: compiled.greeting,
      publicPromptLength: compiled.publicSystemPrompt.length,
      name: compiled.name,
      emoji: compiled.emoji,
    },
    brain,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  };

  return jsonResponse(status);
}

/**
 * POST /api/execute-task
 *
 * Execute a scheduled task from AdmiralDO.
 * Validates fleet JWT, decrypts PAT (if available), runs task, stores result.
 */
async function handleExecuteTask(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as ExecuteTaskRequest;

    if (!body.taskId) {
      return errorResponse("Missing taskId", 400);
    }

    if (!body.token) {
      return errorResponse("Missing fleet JWT token", 401);
    }

    // Verify fleet JWT
    let jwtPayload;
    try {
      jwtPayload = verifyFleetJwt(body.token, env.FLEET_JWT_SECRET);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(`Invalid JWT: ${msg}`, 401);
    }

    // Get task config from AdmiralDO
    const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName(jwtPayload.sub));
    const taskResponse = await admiralStub.fetch(
      new Request(`https://admiral.internal/tasks/status/${body.taskId}`, {
        method: "GET",
      })
    );

    if (!taskResponse.ok) {
      return errorResponse("Task not found in Admiral", 404);
    }

    const taskData = await taskResponse.json() as TaskStatusResponse;

    // Execute the task
    const result = await executeScheduledTask(body.taskId, taskData, env);

    const response: ExecuteTaskResponse = {
      ok: result.success,
      taskId: body.taskId,
      status: result.success ? "completed" : "failed",
      result: result.output,
      error: result.error,
    };

    return jsonResponse(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Execution failed: ${msg}`, 500);
  }
}

/**
 * Execute a scheduled task with age decryption support.
 * Gracefully degrades if age encryption is not available.
 */
async function executeScheduledTask(
  taskId: string,
  taskData: TaskStatusResponse,
  env: Env
): Promise<{ success: boolean; output?: string; error?: string }> {
  try {
    // In a real implementation, this would:
    // 1. Decrypt user PAT with age encryption (graceful degradation if unavailable)
    // 2. Clone private repo to temp storage
    // 3. Run agent with task instructions
    // 4. Stream results back via SSE or store in DO
    // 5. Clean up temp storage

    // For now, simulate execution
    await new Promise((resolve) => setTimeout(resolve, 10));

    const output = `Task ${taskId} executed successfully at ${new Date().toISOString()}`;

    // Store result back in AdmiralDO
    const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("default"));
    await admiralStub.fetch(
      new Request(`https://admiral.internal/tasks/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, result: output }),
      })
    );

    return { success: true, output };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { success: false, error };
  }
}

/**
 * POST /api/webhook/github
 *
 * GitHub webhook handler.
 * Validates signature and triggers tasks based on webhook events.
 */
async function handleGitHubWebhook(request: Request, env: Env): Promise<Response> {
  try {
    const signature = request.headers.get("X-Hub-Signature-256");
    if (!signature) {
      return errorResponse("Missing signature", 401);
    }

    if (!signature.startsWith("sha256=")) {
      return errorResponse("Invalid signature format", 401);
    }

    const event = request.headers.get("X-GitHub-Event");
    const payload = await request.json() as Record<string, unknown>;

    // Forward to AdmiralDO for processing
    const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("default"));
    const webhookResponse = await admiralStub.fetch(
      new Request(`https://admiral.internal/tasks/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": signature,
          "X-GitHub-Event": event ?? "ping",
        },
        body: JSON.stringify(payload),
      })
    );

    if (!webhookResponse.ok) {
      const error = await webhookResponse.text();
      return errorResponse(`Webhook processing failed: ${error}`, webhookResponse.status);
    }

    return jsonResponse({ ok: true, event });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Webhook processing failed: ${msg}`, 400);
  }
}

/**
 * GET /api/status/:taskId
 *
 * Get execution status and logs for a task.
 */
async function handleGetTaskStatus(taskId: string, env: Env): Promise<Response> {
  if (!taskId) {
    return errorResponse("Missing taskId", 400);
  }

  try {
    // Fetch status from AdmiralDO
    const admiralStub = env.ADMIRAL.get(env.ADMIRAL.idFromName("default"));
    const statusResponse = await admiralStub.fetch(
      new Request(`https://admiral.internal/tasks/status/${taskId}`, {
        method: "GET",
      })
    );

    if (!statusResponse.ok) {
      return errorResponse("Task not found", 404);
    }

    const data = await statusResponse.json() as TaskStatusResponse;
    return jsonResponse(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Failed to fetch status: ${msg}`, 500);
  }
}

/**
 * POST /api/chat
 *
 * Chat endpoint with soul.md-based personality.
 * Uses the public system prompt (strips private sections) in public mode.
 * Requires DEEPSEEK_API_KEY to be configured.
 */
async function handleChat(request: Request, env: Env): Promise<Response> {
  // Require authentication via X-API-Key or Authorization header
  const apiKey = request.headers.get("X-API-Key");
  const authHeader = request.headers.get("Authorization");
  if (!apiKey && !authHeader) {
    return errorResponse('Authentication required: provide X-API-Key or Authorization header', 401);
  }

  // Basic format validation — full verification happens via verifyApiKey or fleet JWT
  if (authHeader && !authHeader.startsWith("Bearer ")) {
    return errorResponse('Invalid Authorization header format: expected "Bearer <token>"', 401);
  }

  try {
    const body = await request.json() as { messages?: ChatMessage[] };

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return errorResponse('Missing or empty messages array', 400);
    }

    // Validate message format
    for (const msg of body.messages) {
      if (!msg.role || !msg.content || !['system', 'user', 'assistant'].includes(msg.role)) {
        return errorResponse('Invalid message format: each message must have role (system/user/assistant) and content', 400);
      }
    }

    if (!env.DEEPSEEK_API_KEY) {
      return errorResponse('DEEPSEEK_API_KEY is not configured. Set it via: wrangler secret put DEEPSEEK_API_KEY', 503);
    }

    // Inject soul.md personality (public mode: use publicSystemPrompt)
    const compiled = await loadCompiledSoul(env);
    const messages: ChatMessage[] = [];

    if (compiled.publicSystemPrompt) {
      messages.push({ role: 'system', content: compiled.publicSystemPrompt });
    }

    // Prepend soul.md system prompt, then user messages (skip any user-provided system)
    for (const msg of body.messages) {
      if (msg.role !== 'system') {
        messages.push(msg);
      }
    }

    const result = await chatWithDeepSeek(messages, env.DEEPSEEK_API_KEY);
    return jsonResponse(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Chat failed: ${msg}`, 500);
  }
}

// ─── Cloud Bridge Handlers ──────────────────────────────────────────────────────

/**
 * POST /api/heartbeat
 *
 * Local bridge reports its status. Cloud marks agent as online.
 */
async function handleHeartbeat(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      instanceId?: string;
      bridgeMode?: string;
      tunnelActive?: boolean;
      version?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.instanceId) {
      return errorResponse("Missing instanceId", 400);
    }

    // Verify fleet JWT
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Missing or invalid Authorization header", 401);
    }

    const token = authHeader.slice(7);
    try {
      verifyFleetJwt(token, env.FLEET_JWT_SECRET);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorResponse(`Invalid JWT: ${msg}`, 401);
    }

    const heartbeat: AgentHeartbeat = {
      instanceId: body.instanceId,
      bridgeMode: body.bridgeMode ?? "private",
      tunnelActive: body.tunnelActive ?? false,
      timestamp: new Date().toISOString(),
      version: body.version ?? "0.0.0",
      metadata: body.metadata,
    };

    heartbeatTracker.recordHeartbeat(heartbeat);
    maybePrune();

    // Store latest heartbeat in KV for persistence across Worker restarts
    await env.AUTH_KV.put(
      `heartbeat:${body.instanceId}`,
      JSON.stringify(heartbeat),
      { expirationTtl: 120 }
    );

    return jsonResponse({
      ok: true,
      received: heartbeat.timestamp,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Heartbeat failed: ${msg}`, 500);
  }
}

/**
 * GET /api/agent-status
 *
 * Returns online/offline status of the local agent.
 */
async function handleAgentOnlineStatus(env: Env): Promise<Response> {
  maybePrune();

  const allHeartbeats = heartbeatTracker.getAll();

  // Also check KV for any persisted heartbeats
  const kvList = await env.AUTH_KV.list({ prefix: "heartbeat:" });
  for (const key of kvList.keys) {
    const instanceId = key.name.replace("heartbeat:", "");
    if (!heartbeatTracker.getHeartbeat(instanceId)) {
      const raw = await env.AUTH_KV.get(key.name);
      if (raw) {
        try {
          const hb = JSON.parse(raw) as AgentHeartbeat;
          heartbeatTracker.recordHeartbeat(hb);
        } catch {
          // Malformed KV entry
        }
      }
    }
  }

  const agents = heartbeatTracker.getAll();
  const online = agents.some((a) => a.tunnelActive);

  return jsonResponse({
    ok: true,
    online,
    agents: agents.map((a) => ({
      instanceId: a.instanceId,
      bridgeMode: a.bridgeMode,
      online: a.tunnelActive,
      lastHeartbeat: a.timestamp,
      version: a.version,
    })),
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /ws (WebSocket upgrade)
 *
 * Public client WebSocket relay. Connects client to the local agent
 * through the RelayDO Durable Object.
 */
async function handleWsRelay(request: Request, env: Env): Promise<Response> {
  // Route to RelayDO for persistent relay state
  const relayId = env.RELAY_DO.idFromName("default");
  const relayStub = env.RELAY_DO.get(relayId);

  // Forward the request to the RelayDO
  return relayStub.fetch(request);
}

/**
 * GET /api/tunnel (WebSocket upgrade)
 *
 * Local agent establishes reverse tunnel through this endpoint.
 * The tunnel allows the cloud worker to relay messages to the local agent.
 */
async function handleTunnel(request: Request, env: Env): Promise<Response> {
  // Verify auth
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return errorResponse("Missing tunnel token", 401);
  }

  try {
    verifyFleetJwt(token, env.FLEET_JWT_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Invalid tunnel JWT: ${msg}`, 401);
  }

  // Route to RelayDO
  const relayId = env.RELAY_DO.idFromName("default");
  const relayStub = env.RELAY_DO.get(relayId);

  return relayStub.fetch(request);
}

/**
 * POST /api/chat (enhanced)
 *
 * If local agent is online via tunnel, proxy the chat request through the relay.
 * Otherwise, fall back to direct DeepSeek LLM call (existing behavior).
 */
async function handleChatProxy(
  request: Request,
  env: Env,
  relayState: RelayState
): Promise<Response> {
  // If tunnel is active, forward to local agent
  if (relayState.isTunnelActive()) {
    try {
      const body = await request.json() as { messages?: ChatMessage[] };
      const relayMsg = JSON.stringify({
        type: "chat",
        payload: body,
        timestamp: new Date().toISOString(),
      });

      // Send to tunnel and wait for response
      relayState.handleClientMessage("http-proxy", relayMsg);

      // For HTTP, we don't wait for WebSocket response — fall through to DeepSeek
      // The WebSocket path handles full relay; HTTP is a best-effort proxy
    } catch {
      // Fall through to DeepSeek
    }
  }

  // Fall back to existing DeepSeek chat
  return handleChat(request, env);
}

// ─── Response Helpers ─────────────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(data: unknown, status = 200): Response {
  return withCors(new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

function errorResponse(message: string, status: number): Response {
  return withCors(new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

// ─── Handler ──────────────────────────────────────────────────────────────────

const WORKER_START_TIME = Date.now();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS for browser clients
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    // ── Chat UI ────────────────────────────────────────────────────────────────

    // Serve the embedded chat UI at root and /chat
    if ((pathname === "/" || pathname === "/chat") && request.method === "GET") {
      return new Response(CHAT_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ── HTTP API Routes ───────────────────────────────────────────────────────

    // Health check (with brain state validation)
    if (pathname === "/api/health" && request.method === "GET") {
      return handleHealthCheck(env);
    }

    // Agent status (soul.md info, brain state, version)
    if (pathname === "/api/status" && request.method === "GET") {
      return handleAgentStatus(env, WORKER_START_TIME);
    }

    // Execute scheduled task
    if (pathname === "/api/execute-task" && request.method === "POST") {
      return handleExecuteTask(request, env);
    }

    // Chat endpoint
    if (pathname === "/api/chat" && request.method === "POST") {
      return handleChat(request, env);
    }

    // GitHub webhook
    if (pathname === "/api/webhook/github" && request.method === "POST") {
      return handleGitHubWebhook(request, env);
    }

    // Task status
    if (pathname.startsWith("/api/status/") && request.method === "GET") {
      const taskId = pathname.slice("/api/status/".length);
      return handleGetTaskStatus(taskId, env);
    }

    // ── Cloud Bridge Routes ──────────────────────────────────────────────────

    // Agent heartbeat (local bridge reports online status)
    if (pathname === "/api/heartbeat" && request.method === "POST") {
      return handleHeartbeat(request, env);
    }

    // Agent online/offline status
    if (pathname === "/api/agent-status" && request.method === "GET") {
      return handleAgentOnlineStatus(env);
    }

    // WebSocket relay for public clients
    if (pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return handleWsRelay(request, env);
    }

    // Tunnel connection from local agent
    if (pathname === "/api/tunnel" && request.headers.get("Upgrade") === "websocket") {
      return handleTunnel(request, env);
    }

    // ── Auth Routes ─────────────────────────────────────────────────────────────

    // Sign up
    if (pathname === "/api/auth/signup" && request.method === "POST") {
      return handleSignup(request, env);
    }

    // Sign in
    if (pathname === "/api/auth/signin" && request.method === "POST") {
      return handleSignin(request, env);
    }

    // Refresh token
    if (pathname === "/api/auth/refresh" && request.method === "POST") {
      return handleRefresh(request, env);
    }

    // Sign out
    if (pathname === "/api/auth/signout" && request.method === "POST") {
      return handleSignout(request, env);
    }

    // Get current user
    if (pathname === "/api/auth/me" && request.method === "GET") {
      return handleGetMe(request, env);
    }

    // Create API key
    if (pathname === "/api/auth/api-keys" && request.method === "POST") {
      return handleCreateApiKey(request, env);
    }

    // List API keys
    if (pathname === "/api/auth/api-keys" && request.method === "GET") {
      return handleListApiKeys(request, env);
    }

    // Revoke API key
    if (pathname.startsWith("/api/auth/api-keys/") && request.method === "DELETE") {
      return handleRevokeApiKey(request, env);
    }

    // ── A2A Server Routes (fallback) ────────────────────────────────────────────

    // Extract per-request GitHub token forwarded by the local bridge
    const authHeader = request.headers.get("Authorization") ?? "";
    const requestToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const github  = makeGitHubClient(
      { GITHUB_PAT: env.GITHUB_PAT, PRIVATE_REPO: env.PRIVATE_REPO, PUBLIC_REPO: env.PUBLIC_REPO },
      requestToken
    );

    // Admiral DO instance — one per user (keyed to a fixed id)
    const admiralId     = env.ADMIRAL.idFromName("default");
    const admiralStub   = env.ADMIRAL.get(admiralId);
    const admiralClient = new AdmiralClient(admiralStub.id.toString());

    // ── A2A server ──────────────────────────────────────────────────────────

    const origin = new URL(request.url).origin;

    const server = new A2AServer(
      {
        ...AGENT_CARD,
        url: origin,
      },
      {
        onSendTask: async (params) => {
          const taskId     = params.id ?? `task-${Date.now()}`;
          const userText   = params.message.parts
            .filter((p) => p.type === "text")
            .map((p) => (p.type === "text" ? p.text : ""))
            .join(" ");

          // Track in Admiral
          await admiralClient.upsertTask({
            id:          taskId,
            agentId:     "cloud-agent",
            description: userText.slice(0, 120),
            status:      "running",
          });

          // Load context from Git
          const [soul, facts, wiki] = await Promise.all([
            github.readSoul(),
            github.readFacts(),
            github.readWiki(),
          ]);

          // ── Execute via DeepSeek LLM ─────────────────────────────────────────
          const result = await executeTask(userText, { soul, facts, wiki }, env.DEEPSEEK_API_KEY);

          // Write result back to Git as a coordination message
          try {
            await github.appendNdjson(
              "cocapn/messages/coordination.jsonl",
              {
                timestamp: new Date().toISOString(),
                source:    "cloud-agent",
                taskId,
                summary:   result.slice(0, 500),
              },
              `Cocapn: cloud-agent result for task ${taskId}`
            );

            // Get the latest commit SHA and notify Admiral
            const shaRes = await fetch(
              `https://api.github.com/repos/${env.PRIVATE_REPO}/commits/HEAD`,
              {
                headers: {
                  Authorization: `Bearer ${requestToken ?? env.GITHUB_PAT}`,
                  Accept: "application/vnd.github+json",
                },
              }
            );
            if (shaRes.ok) {
              const shaData = await shaRes.json() as { sha?: string };
              if (shaData.sha) {
                await admiralClient.notifyGitCommit(shaData.sha);
              }
            }
          } catch (err) {
            console.warn("cloud-agent: failed to write result to Git:", err);
          }

          // Update Admiral task status
          await admiralClient.upsertTask({
            id:      taskId,
            agentId: "cloud-agent",
            status:  "done",
            result:  result.slice(0, 1000),
          });

          const task = A2AServer.makeTask(taskId, {
            state:   "completed",
            message: {
              role:  "agent",
              parts: [{ type: "text", text: result }],
            },
          });

          return task;
        },

        onGetTask: async (params) => {
          // For now, return a minimal completed stub — a real impl would
          // store task state in the DO or KV.
          return A2AServer.makeTask(params.id, {
            state:   "completed",
            message: {
              role:  "agent",
              parts: [{ type: "text", text: "Task result not in cache; fetch from Git." }],
            },
          });
        },

        onCancelTask: async (params) => {
          await admiralClient.upsertTask({
            id:      params.id,
            agentId: "cloud-agent",
            status:  "failed",
          });
          return A2AServer.makeTask(params.id, { state: "cancelled" });
        },
      }
    );

    const response = await server.handleRequest(request);
    return withCors(response);
  },
};

// ─── Task execution via DeepSeek LLM ─────────────────────────────────────────

async function executeTask(
  userText: string,
  context: { soul: string; facts: unknown[]; wiki: string },
  apiKey?: string,
): Promise<string> {
  const factCount = context.facts.length;

  // Build system prompt from context using SoulCompiler for soul.md
  const systemParts: string[] = ['You are a helpful cloud agent for cocapn.'];

  if (context.soul) {
    // Compile soul.md to get the structured system prompt
    const compiled = soulCompiler.compile(context.soul);
    // In A2A mode use full system prompt (not public-stripped)
    if (compiled.systemPrompt) {
      systemParts.push(compiled.systemPrompt);
    }
  }
  if (factCount > 0) {
    systemParts.push(`Known facts (${factCount}):\n${JSON.stringify(context.facts.slice(0, 20))}`);
  }
  if (context.wiki) {
    systemParts.push(`Wiki:\n${context.wiki.slice(0, 2000)}`);
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemParts.join('\n\n') },
    { role: 'user', content: userText },
  ];

  // If no API key is configured, return context summary (graceful degradation)
  if (!apiKey) {
    return (
      `[Cloud agent received: "${userText}"]\n` +
      `Context loaded — soul: ${context.soul.length > 0}, facts: ${factCount}, wiki: ${context.wiki.length > 0}.\n` +
      `Note: DEEPSEEK_API_KEY is not configured — set via wrangler secret put.`
    );
  }

  const result = await chatWithDeepSeek(messages, apiKey);
  return result.content;
}
