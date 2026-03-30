/**
 * cocapn fleet — Fleet management commands
 *
 * Usage:
 *   cocapn fleet list                 — list fleet members
 *   cocapn fleet list --json          — list as JSON
 *   cocapn fleet status               — fleet overview
 *   cocapn fleet status --json        — fleet overview as JSON
 *   cocapn fleet send <agent> <msg>   — send message to fleet member
 *   cocapn fleet broadcast <message>  — broadcast to all agents
 *   cocapn fleet inspect <agent>      — detailed agent info
 */

import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Colors ──────────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;

// ─── Types ───────────────────────────────────────────────────────────────────

interface FleetMember {
  agentId: string;
  name: string;
  role: string;
  status: string;
  lastHeartbeat: number;
  uptime: number;
  load: number;
  successRate: number;
  skills: string[];
  instanceUrl: string;
}

interface FleetOverview {
  fleetId: string;
  totalAgents: number;
  connected: number;
  disconnected: number;
  messagesLastHour: number;
  tasksRunning: number;
  tasksCompleted: number;
  systemResources: {
    cpuUsage: string;
    memoryUsage: string;
    uptime: number;
  };
}

interface AgentInspect {
  agentId: string;
  name: string;
  role: string;
  status: string;
  uptime: number;
  load: number;
  successRate: number;
  skills: string[];
  brain: {
    facts: number;
    wiki: number;
    memories: number;
    procedures: number;
  };
  llm: {
    provider: string;
    model: string;
  };
  mode: string;
  capabilities: string[];
  lastHeartbeat: number;
  instanceUrl: string;
}

interface SendMessageResponse {
  success: boolean;
  agentId: string;
  message: string;
  response?: string;
  error?: string;
}

interface BroadcastResponse {
  success: boolean;
  message: string;
  delivered: number;
  failed: number;
  total: number;
}

// ─── Bridge API client ───────────────────────────────────────────────────────

const DEFAULT_BRIDGE_URL = "http://localhost:3100";
const FLEET_TIMEOUT = 10000;

async function fetchFleetAPI<T>(path: string): Promise<T> {
  const bridgeUrl = process.env.COCPN_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  const res = await fetch(`${bridgeUrl}/api/fleet${path}`, {
    signal: AbortSignal.timeout(FLEET_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`Bridge API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function postFleetAPI<T>(path: string, body: unknown): Promise<T> {
  const bridgeUrl = process.env.COCPN_BRIDGE_URL || DEFAULT_BRIDGE_URL;
  const res = await fetch(`${bridgeUrl}/api/fleet${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FLEET_TIMEOUT),
  });

  if (!res.ok) {
    throw new Error(`Bridge API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ─── Fallback: read local fleet config ──────────────────────────────────────

function readLocalFleetConfig(cocapnDir: string): { agents: FleetMember[] } | null {
  const fleetPath = join(cocapnDir, "fleet.json");
  if (!existsSync(fleetPath)) return null;

  try {
    const raw = JSON.parse(readFileSync(fleetPath, "utf-8"));
    return {
      agents: (raw.agents || []).map((a: Record<string, unknown>) => ({
        agentId: a.agentId || a.id || "unknown",
        name: a.name || a.agentId || "unknown",
        role: a.role || "worker",
        status: a.status || "offline",
        lastHeartbeat: a.lastHeartbeat || 0,
        uptime: a.uptime || 0,
        load: a.load || 0,
        successRate: a.successRate || 0,
        skills: a.skills || [],
        instanceUrl: a.instanceUrl || "",
      })),
    };
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  if (seconds <= 0) return dim("—");
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatTimeAgo(timestamp: number): string {
  if (timestamp <= 0) return dim("never");
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return green("just now");
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function statusColor(status: string): string {
  switch (status) {
    case "idle": return green(status);
    case "busy": return yellow(status);
    case "degraded": return yellow(status);
    case "offline": return red(status);
    default: return status;
  }
}

function roleIcon(role: string): string {
  switch (role) {
    case "leader": return "\u2605";
    case "worker": return "\u25CB";
    case "specialist": return "\u2726";
    default: return "\u25CB";
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function fleetList(json: boolean): Promise<void> {
  let data: { agents: FleetMember[] };

  try {
    data = await fetchFleetAPI<{ agents: FleetMember[] }>("/agents");
  } catch {
    // Fallback to local config
    const cocapnDir = join(process.cwd(), "cocapn");
    const local = readLocalFleetConfig(cocapnDir);
    if (!local) {
      console.error(yellow("Fleet not available"));
      console.error(dim("  Bridge is not running and no local fleet config found."));
      console.error(dim("  Start the bridge with: cocapn start"));
      process.exit(1);
    }
    data = local;
    console.log(dim("(from local fleet config)\n"));
  }

  if (json) {
    console.log(JSON.stringify(data.agents, null, 2));
    return;
  }

  if (data.agents.length === 0) {
    console.log(yellow("No agents in fleet"));
    return;
  }

  console.log(cyan("Fleet Members\n"));

  const idWidth = Math.max(10, ...data.agents.map((a) => a.agentId.length));
  const nameWidth = Math.max(4, ...data.agents.map((a) => a.name.length));

  for (const agent of data.agents) {
    const role = `${roleIcon(agent.role)} ${agent.role.padEnd(10)}`;
    const id = agent.agentId.padEnd(idWidth);
    const name = bold(agent.name.padEnd(nameWidth));
    const status = statusColor(agent.status.padEnd(10));
    const uptime = formatUptime(agent.uptime).padEnd(8);
    const hb = formatTimeAgo(agent.lastHeartbeat);

    console.log(`  ${role} ${name} ${status} ${dim("up")} ${uptime} ${dim("hb")} ${hb}`);
    if (agent.skills.length > 0) {
      console.log(`    ${dim("skills:")} ${agent.skills.join(", ")}`);
    }
    console.log();
  }
}

async function fleetStatus(json: boolean): Promise<void> {
  let overview: FleetOverview;

  try {
    overview = await fetchFleetAPI<FleetOverview>("/status");
  } catch {
    // Fallback: build from local config
    const cocapnDir = join(process.cwd(), "cocapn");
    const local = readLocalFleetConfig(cocapnDir);
    if (!local) {
      console.error(yellow("Fleet not available"));
      console.error(dim("  Bridge is not running and no local fleet config found."));
      process.exit(1);
    }

    overview = {
      fleetId: "local",
      totalAgents: local.agents.length,
      connected: local.agents.filter((a) => a.status !== "offline").length,
      disconnected: local.agents.filter((a) => a.status === "offline").length,
      messagesLastHour: 0,
      tasksRunning: 0,
      tasksCompleted: 0,
      systemResources: { cpuUsage: "—", memoryUsage: "—", uptime: 0 },
    };
    console.log(dim("(from local fleet config)\n"));
  }

  if (json) {
    console.log(JSON.stringify(overview, null, 2));
    return;
  }

  console.log(cyan("Fleet Overview\n"));

  console.log(`  ${bold("Fleet ID")}       ${dim(overview.fleetId)}`);
  console.log();

  // Agent status
  const total = overview.totalAgents;
  const conn = overview.connected;
  const disc = overview.disconnected;

  console.log(`  ${bold("Agents")}         ${total} total`);
  console.log(`    ${green("\u25CF")} ${conn} connected`);
  if (disc > 0) {
    console.log(`    ${red("\u25CF")} ${disc} disconnected`);
  }
  console.log();

  // Messages
  console.log(`  ${bold("Messages")}       ${overview.messagesLastHour} in last hour`);
  console.log();

  // Tasks
  console.log(`  ${bold("Tasks")}          ${overview.tasksRunning} running, ${overview.tasksCompleted} completed`);
  console.log();

  // System resources
  console.log(`  ${bold("System")}`);
  console.log(`    CPU     ${overview.systemResources.cpuUsage}`);
  console.log(`    Memory  ${overview.systemResources.memoryUsage}`);
  console.log(`    Uptime  ${formatUptime(overview.systemResources.uptime)}`);
  console.log();
}

async function fleetSend(agentId: string, message: string): Promise<void> {
  try {
    const result = await postFleetAPI<SendMessageResponse>("/send", {
      agentId,
      message,
    });

    if (result.success) {
      console.log(green("\u2713") + ` Message sent to ${bold(agentId)}`);
      if (result.response) {
        console.log();
        console.log(`  ${dim("Response:")}`);
        console.log(`  ${result.response}`);
      }
    } else {
      console.error(red("\u2717") + ` Send failed: ${result.error || "unknown error"}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(red("\u2717") + ` Cannot reach fleet`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error(dim("  Ensure the bridge is running with fleet enabled."));
    process.exit(1);
  }
}

async function fleetBroadcast(message: string): Promise<void> {
  try {
    const result = await postFleetAPI<BroadcastResponse>("/broadcast", {
      message,
    });

    if (result.success) {
      console.log(green("\u2713") + ` Broadcast sent to ${bold(String(result.delivered))} agent(s)`);
      if (result.failed > 0) {
        console.log(yellow(`  ${result.failed} delivery failed`));
      }
    } else {
      console.error(red("\u2717") + ` Broadcast failed`);
      process.exit(1);
    }
  } catch (err) {
    console.error(red("\u2717") + ` Cannot reach fleet`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error(dim("  Ensure the bridge is running with fleet enabled."));
    process.exit(1);
  }
}

async function fleetInspect(agentId: string): Promise<void> {
  try {
    const info = await fetchFleetAPI<AgentInspect>(`/agents/${encodeURIComponent(agentId)}`);

    console.log(cyan("Agent Details\n"));

    console.log(`  ${bold("ID")}         ${info.agentId}`);
    console.log(`  ${bold("Name")}       ${bold(info.name)}`);
    console.log(`  ${bold("Role")}       ${roleIcon(info.role)} ${info.role}`);
    console.log(`  ${bold("Status")}     ${statusColor(info.status)}`);
    console.log(`  ${bold("Mode")}       ${info.mode}`);
    console.log(`  ${bold("Uptime")}     ${formatUptime(info.uptime)}`);
    console.log(`  ${bold("Load")}       ${Math.round(info.load * 100)}%`);
    console.log(`  ${bold("Success")}    ${Math.round(info.successRate * 100)}%`);
    console.log(`  ${bold("Heartbeat")}  ${formatTimeAgo(info.lastHeartbeat)}`);
    console.log(`  ${bold("URL")}        ${dim(info.instanceUrl)}`);
    console.log();

    // Brain stats
    console.log(`  ${bold("Brain")}`);
    console.log(`    Facts       ${info.brain.facts}`);
    console.log(`    Wiki        ${info.brain.wiki}`);
    console.log(`    Memories    ${info.brain.memories}`);
    console.log(`    Procedures  ${info.brain.procedures}`);
    console.log();

    // LLM config
    console.log(`  ${bold("LLM")}`);
    console.log(`    Provider    ${info.llm.provider}`);
    console.log(`    Model       ${dim(info.llm.model)}`);
    console.log();

    // Capabilities
    if (info.capabilities.length > 0) {
      console.log(`  ${bold("Capabilities")}`);
      for (const cap of info.capabilities) {
        console.log(`    ${green("\u25CB")} ${cap}`);
      }
      console.log();
    }

    // Skills
    if (info.skills.length > 0) {
      console.log(`  ${bold("Skills")}`);
      for (const skill of info.skills) {
        console.log(`    ${cyan("\u25CB")} ${skill}`);
      }
      console.log();
    }
  } catch (err) {
    console.error(red("\u2717") + ` Cannot inspect agent "${agentId}"`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// ─── Command ─────────────────────────────────────────────────────────────────

export function createFleetCommand(): Command {
  const cmd = new Command("fleet")
    .description("Manage fleet of agents");

  // ── list ──────────────────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("List fleet members")
    .option("--json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      try {
        await fleetList(!!options.json);
      } catch (err) {
        console.error(yellow("List failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── status ────────────────────────────────────────────────────────────────

  cmd
    .command("status")
    .description("Fleet overview")
    .option("--json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      try {
        await fleetStatus(!!options.json);
      } catch (err) {
        console.error(yellow("Status failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── send ──────────────────────────────────────────────────────────────────

  cmd
    .command("send <agent> <message>")
    .description("Send message to a fleet member")
    .action(async (agent: string, message: string) => {
      try {
        await fleetSend(agent, message);
      } catch (err) {
        console.error(yellow("Send failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── broadcast ─────────────────────────────────────────────────────────────

  cmd
    .command("broadcast <message>")
    .description("Broadcast message to all agents")
    .action(async (message: string) => {
      try {
        await fleetBroadcast(message);
      } catch (err) {
        console.error(yellow("Broadcast failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── inspect ───────────────────────────────────────────────────────────────

  cmd
    .command("inspect <agent>")
    .description("Detailed agent info")
    .action(async (agent: string) => {
      try {
        await fleetInspect(agent);
      } catch (err) {
        console.error(yellow("Inspect failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}

// Exported for testing
export {
  formatUptime,
  formatTimeAgo,
  statusColor,
  roleIcon,
  fetchFleetAPI,
  postFleetAPI,
  readLocalFleetConfig,
  fleetList,
  fleetStatus,
  fleetSend,
  fleetBroadcast,
  fleetInspect,
};

export type {
  FleetMember,
  FleetOverview,
  AgentInspect,
  SendMessageResponse,
  BroadcastResponse,
};
