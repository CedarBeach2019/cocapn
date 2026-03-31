/**
 * cocapn agents — manage repo-native AI agents (Manus, OpenClaw, Claude Code, etc.)
 *
 * Usage:
 *   cocapn agents list                                 List agent instances
 *   cocapn agents create --type <type> --name <name>   Create a new agent
 *   cocapn agents start <id>                           Start an agent
 *   cocapn agents stop <id>                            Stop an agent
 *   cocapn agents send <id> <message>                  Send a message to an agent
 *   cocapn agents remove <id>                          Remove an agent
 *   cocapn agents status <id>                          Detailed agent status
 */

import { Command } from "commander";
import { AgentManager, type AgentType } from "../../local-bridge/src/agents/agent-manager.js";

// --- Color helpers ---

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
};
const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;

const VALID_TYPES: AgentType[] = ["cocapn", "manus", "openclaw", "claude-code", "custom"];

// Singleton manager — shared across subcommands in a single CLI invocation.
let _manager: AgentManager | undefined;

function getManager(): AgentManager {
  if (!_manager) {
    _manager = new AgentManager();
  }
  return _manager;
}

// --- Public API ---

export function createAgentsCommand(): Command {
  return new Command("agents")
    .description("Manage repo-native AI agents (Manus, OpenClaw, Claude Code, etc.)")
    .addCommand(createListCommand())
    .addCommand(createCreateCommand())
    .addCommand(createStartCommand())
    .addCommand(createStopCommand())
    .addCommand(createSendCommand())
    .addCommand(createRemoveCommand())
    .addCommand(createStatusCommand());
}

// --- Subcommands ---

function createListCommand(): Command {
  return new Command("list")
    .description("List all agent instances")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const manager = getManager();
        const agents = await manager.list();

        if (opts.json) {
          console.log(JSON.stringify(agents, null, 2));
          return;
        }

        if (agents.length === 0) {
          console.log(yellow("No agent instances found."));
          console.log(`Create one with: ${cyan("cocapn agents create --type manus --name my-agent")}`);
          return;
        }

        console.log(bold("Agent Instances"));
        console.log();

        for (const agent of agents) {
          const statusIcon = agent.status === "running" ? green("●") :
            agent.status === "error" ? red("●") : yellow("○");
          console.log(`  ${statusIcon} ${bold(agent.name)} ${dim(`(${agent.id.slice(0, 8)}...)`)}`);
          console.log(`    Type: ${agent.type}  Status: ${agent.status}  Created: ${new Date(agent.createdAt).toLocaleString()}`);
        }

        console.log();
        console.log(`${agents.length} agent(s) total`);
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

function createCreateCommand(): Command {
  return new Command("create")
    .description("Create a new agent instance")
    .requiredOption("-t, --type <type>", `Agent type (${VALID_TYPES.join(", ")})`)
    .requiredOption("-n, --name <name>", "Agent name")
    .option("-d, --working-dir <path>", "Working directory")
    .option("-e, --env <pairs...>", "Environment variables (KEY=VALUE)")
    .option("--json", "Output as JSON")
    .action(async (opts: { type: string; name: string; workingDir?: string; env?: string[]; json?: boolean }) => {
      try {
        if (!VALID_TYPES.includes(opts.type as AgentType)) {
          throw new Error(`Invalid agent type: "${opts.type}". Valid types: ${VALID_TYPES.join(", ")}`);
        }

        const env: Record<string, string> = {};
        if (opts.env) {
          for (const pair of opts.env) {
            const eq = pair.indexOf("=");
            if (eq === -1) {
              throw new Error(`Invalid env pair: "${pair}". Expected KEY=VALUE format.`);
            }
            env[pair.slice(0, eq)] = pair.slice(eq + 1);
          }
        }

        const manager = getManager();
        const instance = await manager.create({
          type: opts.type as AgentType,
          name: opts.name,
          workingDir: opts.workingDir,
          env: Object.keys(env).length > 0 ? env : undefined,
        });

        if (opts.json) {
          console.log(JSON.stringify(instance, null, 2));
          return;
        }

        console.log(green("✓") + ` Agent created: ${bold(instance.name)} (${instance.id})`);
        console.log(`  Type: ${instance.type}  Status: ${instance.status}`);
        console.log();
        console.log(`Start it with: ${cyan(`cocapn agents start ${instance.id}`)}`);
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

function createStartCommand(): Command {
  return new Command("start")
    .description("Start a stopped agent")
    .argument("<id>", "Agent ID (or first 8+ chars)")
    .action(async (id: string) => {
      try {
        const manager = getManager();
        const agents = await manager.list();
        const agent = resolveAgent(agents, id);

        await manager.start(agent.id);
        console.log(green("✓") + ` Agent ${bold(agent.name)} started`);
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

function createStopCommand(): Command {
  return new Command("stop")
    .description("Stop a running agent")
    .argument("<id>", "Agent ID (or first 8+ chars)")
    .action(async (id: string) => {
      try {
        const manager = getManager();
        const agents = await manager.list();
        const agent = resolveAgent(agents, id);

        await manager.stop(agent.id);
        console.log(green("✓") + ` Agent ${bold(agent.name)} stopped`);
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

function createSendCommand(): Command {
  return new Command("send")
    .description("Send a message to an agent")
    .argument("<id>", "Agent ID (or first 8+ chars)")
    .argument("<message>", "Message to send")
    .action(async (id: string, message: string) => {
      try {
        const manager = getManager();
        const agents = await manager.list();
        const agent = resolveAgent(agents, id);

        console.log(cyan(`▸ Sending to ${agent.name}...`));
        const response = await manager.send(agent.id, message);
        console.log();
        console.log(response);
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

function createRemoveCommand(): Command {
  return new Command("remove")
    .description("Remove an agent instance")
    .argument("<id>", "Agent ID (or first 8+ chars)")
    .action(async (id: string) => {
      try {
        const manager = getManager();
        const agents = await manager.list();
        const agent = resolveAgent(agents, id);

        await manager.remove(agent.id);
        console.log(green("✓") + ` Agent ${bold(agent.name)} removed`);
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

function createStatusCommand(): Command {
  return new Command("status")
    .description("Detailed status for a specific agent")
    .argument("<id>", "Agent ID (or first 8+ chars)")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const manager = getManager();
        const agents = await manager.list();
        const agent = resolveAgent(agents, id);
        const status = await manager.getStatus(agent.id);

        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

        console.log(bold(`Agent: ${status.instance.name}`));
        console.log(`  ID:         ${status.instance.id}`);
        console.log(`  Type:       ${status.instance.type}`);
        console.log(`  Status:     ${status.instance.status}`);
        console.log(`  Created:    ${new Date(status.instance.createdAt).toLocaleString()}`);
        console.log(`  Last active:${new Date(status.instance.lastActive).toLocaleString()}`);

        if (status.uptime > 0) {
          const secs = Math.floor(status.uptime / 1000);
          const mins = Math.floor(secs / 60);
          console.log(`  Uptime:     ${mins}m ${secs % 60}s`);
        }

        console.log(`  Messages:   ${status.messagesProcessed}`);

        if (status.lastError) {
          console.log(`  Last error: ${red(status.lastError)}`);
        }
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}

// --- Helpers ---

/**
 * Resolve a partial agent ID (first N chars) to a full agent instance.
 */
function resolveAgent(
  agents: Array<{ id: string; name: string }>,
  partialId: string,
): { id: string; name: string } {
  // Exact match first.
  const exact = agents.find((a) => a.id === partialId);
  if (exact) return exact;

  // Prefix match.
  const matches = agents.filter((a) => a.id.startsWith(partialId));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(`Ambiguous ID "${partialId}" matches ${matches.length} agents. Use a longer prefix.`);
  }

  // Name match.
  const byName = agents.find((a) => a.name === partialId);
  if (byName) return byName;

  throw new Error(`Agent not found: ${partialId}`);
}

export { resolveAgent };
