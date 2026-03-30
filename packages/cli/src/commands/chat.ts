/**
 * cocapn chat — Interactive terminal chat with the cocapn agent.
 *
 * Connects to the bridge at localhost:<port>/api/chat, streams responses
 * via SSE, and stores history in ~/.cocapn/chat-history.jsonl.
 */

import { Command } from "commander";
import { createInterface } from "readline";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface ChatHistory {
  messages: ChatMessage[];
  mode: "public" | "private";
  startedAt: string;
}

// ─── ANSI colors (no deps) ──────────────────────────────────────────────────

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
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;
const gray = (s: string) => `${c.gray}${s}${c.reset}`;

// ─── History file ───────────────────────────────────────────────────────────

function getHistoryDir(): string {
  const dir = join(homedir(), ".cocapn");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getHistoryPath(): string {
  return join(getHistoryDir(), "chat-history.jsonl");
}

function loadHistory(): ChatMessage[] {
  const path = getHistoryPath();
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
  const messages: ChatMessage[] = [];
  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as ChatMessage;
      if (msg.role && msg.content && msg.timestamp) {
        messages.push(msg);
      }
    } catch {
      // skip malformed lines
    }
  }
  return messages;
}

function appendToHistory(msg: ChatMessage): void {
  appendFileSync(getHistoryPath(), JSON.stringify(msg) + "\n");
}

function clearHistory(): void {
  const path = getHistoryPath();
  if (existsSync(path)) writeFileSync(path, "");
}

// ─── SSE parser ─────────────────────────────────────────────────────────────

/**
 * Parse an SSE stream from the bridge.
 * The bridge sends `data: {"content": "...", "done": false}` lines.
 * When `done: true`, the stream ends.
 */
export async function parseSSEStream(
  response: Response,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    onError(new Error("No response body"));
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(payload) as { content?: string; done?: boolean; error?: string };
          if (parsed.error) {
            onError(new Error(parsed.error));
            return;
          }
          if (parsed.content) {
            onChunk(parsed.content);
          }
          if (parsed.done) {
            onDone();
            return;
          }
        } catch {
          // skip non-JSON data lines
        }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ─── Export helpers ─────────────────────────────────────────────────────────

export function exportConversation(messages: ChatMessage[], format: "json" | "md"): string {
  if (format === "json") {
    return JSON.stringify({ messages, exportedAt: new Date().toISOString() }, null, 2);
  }

  // Markdown format
  const lines: string[] = [
    `# Chat Export`,
    `Exported: ${new Date().toISOString()}`,
    `Messages: ${messages.length}`,
    "",
  ];

  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleTimeString();
    if (msg.role === "system") {
      lines.push(`*${dim(`[${time}] [system] ${msg.content}`)}*`);
    } else if (msg.role === "user") {
      lines.push(`**[${time}] You:** ${msg.content}`);
    } else {
      lines.push(`**[${time}] Agent:** ${msg.content}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Bridge check ───────────────────────────────────────────────────────────

async function checkBridge(host: string, port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://${host}:${port}/api/status`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchAgentStatus(host: string, port: number): Promise<string> {
  try {
    const res = await fetch(`http://${host}:${port}/api/status`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return dim("Could not fetch status");
    const data = await res.json() as Record<string, unknown>;
    const agent = data.agent as Record<string, unknown> | undefined;
    const llm = data.llm as Record<string, unknown> | undefined;
    if (!agent) return dim("No agent info");
    const lines = [
      `${bold("Name:")} ${String(agent.name ?? "unknown")}`,
      `${bold("Mode:")} ${String(agent.mode ?? "unknown")}`,
      `${bold("Model:")} ${String(llm?.model ?? "unknown")}`,
    ];
    return lines.join("\n");
  } catch {
    return dim("Could not fetch status");
  }
}

// ─── REPL ───────────────────────────────────────────────────────────────────

async function chatLoop(options: {
  host: string;
  port: number;
  mode: "public" | "private";
}): Promise<void> {
  const baseUrl = `http://${options.host}:${options.port}`;
  const history = loadHistory();

  console.log(cyan(bold("╭─ Cocapn Chat ─────────────────────────────────╮")));
  console.log(gray(`  Mode: ${options.mode}  |  Bridge: ${baseUrl}`));
  console.log(gray("  Commands: /quit, /clear, /status, /mode, /export"));
  console.log(gray("  Multi-line: end a line with \\ to continue"));
  console.log(cyan(bold("╰───────────────────────────────────────────────╯")));
  console.log("");

  if (history.length > 0) {
    console.log(dim(`Loaded ${history.length} messages from history\n`));
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: green("> "),
    historySize: 100,
  });

  let currentMode = options.mode;

  // Set up raw mode for Ctrl+C handling
  process.stdin.setRawMode?.(false);

  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();

    // Empty input
    if (!trimmed) {
      rl.prompt();
      continue;
    }

    // Multi-line continuation
    if (trimmed.endsWith("\\")) {
      // Read continuation lines
      let fullInput = trimmed.slice(0, -1) + "\n";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const cont = await new Promise<string>((resolve) => {
          rl.question(dim("... "), resolve);
        });
        if (cont.trimEnd().endsWith("\\")) {
          fullInput += cont.trimEnd().slice(0, -1) + "\n";
        } else {
          fullInput += cont;
          break;
        }
      }
      await sendMessage(fullInput, baseUrl, history, currentMode);
      rl.prompt();
      continue;
    }

    // Commands
    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      switch (cmd) {
        case "/quit":
        case "/exit":
        case "/q":
          console.log(dim("Goodbye!"));
          rl.close();
          return;

        case "/clear":
          clearHistory();
          history.length = 0;
          console.log(dim("History cleared."));
          break;

        case "/status":
          console.log(await fetchAgentStatus(options.host, options.port));
          break;

        case "/mode": {
          const newMode = args[0];
          if (!newMode || (newMode !== "public" && newMode !== "private")) {
            console.log(dim(`Current mode: ${currentMode}. Usage: /mode [public|private]`));
          } else {
            currentMode = newMode;
            console.log(dim(`Switched to ${currentMode} mode.`));
          }
          break;
        }

        case "/export": {
          const fmt = (args[0] === "md" ? "md" : "json") as "json" | "md";
          const output = exportConversation([...history], fmt);
          console.log(output);
          break;
        }

        default:
          console.log(yellow(`Unknown command: ${cmd}`));
          console.log(dim("Commands: /quit, /clear, /status, /mode, /export"));
          break;
      }

      rl.prompt();
      continue;
    }

    // Regular message
    await sendMessage(trimmed, baseUrl, history, currentMode);
    rl.prompt();
  }
}

async function sendMessage(
  input: string,
  baseUrl: string,
  history: ChatMessage[],
  mode: string,
): Promise<void> {
  const userMsg: ChatMessage = {
    role: "user",
    content: input,
    timestamp: new Date().toISOString(),
  };
  history.push(userMsg);
  appendToHistory(userMsg);

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: input,
        mode,
        history: history.slice(-20), // send last 20 messages for context
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(yellow(`Bridge error (${res.status}): ${text || "unknown error"}`));
      return;
    }

    // Check if streaming or JSON
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      // SSE streaming
      process.stdout.write(bold("Agent: "));
      let fullResponse = "";
      await parseSSEStream(
        res,
        (chunk) => {
          process.stdout.write(chunk);
          fullResponse += chunk;
        },
        () => {
          console.log(""); // newline after response
          const assistantMsg: ChatMessage = {
            role: "assistant",
            content: fullResponse,
            timestamp: new Date().toISOString(),
          };
          history.push(assistantMsg);
          appendToHistory(assistantMsg);
        },
        (err) => {
          console.error(yellow(`Stream error: ${err.message}`));
          if (fullResponse) {
            const assistantMsg: ChatMessage = {
              role: "assistant",
              content: fullResponse,
              timestamp: new Date().toISOString(),
            };
            history.push(assistantMsg);
            appendToHistory(assistantMsg);
          }
        },
      );
    } else {
      // Plain JSON response
      const data = await res.json() as { reply?: string; content?: string; error?: string };
      if (data.error) {
        console.error(yellow(`Agent error: ${data.error}`));
        return;
      }
      const reply = data.reply ?? data.content ?? "No response";
      console.log(bold("Agent: ") + reply);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: reply,
        timestamp: new Date().toISOString(),
      };
      history.push(assistantMsg);
      appendToHistory(assistantMsg);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("fetch") || msg.includes("ECONNREFUSED") || msg.includes("timeout")) {
      console.error(yellow("Cannot connect to bridge. Start it with: ") + cyan("cocapn start"));
    } else {
      console.error(yellow(`Error: ${msg}`));
    }
  }
}

// ─── Command ────────────────────────────────────────────────────────────────

export function createChatCommand(): Command {
  return new Command("chat")
    .description("Interactive terminal chat with the cocapn agent")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-m, --mode <mode>", "Chat mode: public or private", "private")
    .action(async (options: {
      host: string;
      port: string;
      mode: string;
    }) => {
      const port = parseInt(options.port, 10);
      const mode = options.mode === "public" ? "public" : "private";

      // Check if bridge is running
      const online = await checkBridge(options.host, port);
      if (!online) {
        console.log(yellow("Bridge is not running."));
        console.log(dim(`  Checked http://${options.host}:${port}/api/status`));
        console.log("");
        console.log("Start it with: " + cyan("cocapn start"));
        process.exit(1);
      }

      await chatLoop({ host: options.host, port, mode });
    });
}
