// response-logger.ts — Log LLM responses for analytics
// Author: Superinstance & Lucineer (DiGennaro et al.)

interface LogEntry {
  timestamp: number;
  inputHash: string;
  responseLen: number;
  fromCache: boolean;
  latencyMs?: number;
}

const LOG_TTL = 86400; // 24h
const MAX_LOGS = 200;

export async function logResponse(
  kv: KVNamespace,
  prefix: string,
  entry: LogEntry
): Promise<void> {
  const key = `resplog:${prefix}:${Date.now()}`;
  await kv.put(key, JSON.stringify(entry), { expirationTtl: LOG_TTL });

  // Prune old logs if too many
  const list = await kv.list({ prefix: `resplog:${prefix}:`, limit: MAX_LOGS + 50 });
  if (list.keys.length > MAX_LOGS) {
    const toDelete = list.keys.slice(0, list.keys.length - MAX_LOGS);
    await Promise.all(toDelete.map(k => kv.delete(k.name)));
  }
}

export async function getResponseLogs(
  kv: KVNamespace,
  prefix: string,
  limit = 50
): Promise<LogEntry[]> {
  const list = await kv.list({ prefix: `resplog:${prefix}:`, limit });
  const logs: LogEntry[] = [];
  for (const key of list.keys) {
    const raw = await kv.get(key.name, 'json') as LogEntry | null;
    if (raw) logs.push(raw);
  }
  return logs.sort((a, b) => b.timestamp - a.timestamp);
}
