// deadband.ts — Response deduplication via KV-backed deadband cache
// Author: Superinstance & Lucineer (DiGennaro et al.)

interface DeadbandEntry {
  hash: string;
  response: string;
  timestamp: number;
  hitCount: number;
}

const DEADBAND_TTL = 3600; // seconds — cache window for identical inputs
const MAX_HASH_LEN = 128;

export function hashInput(messages: any[]): string {
  const raw = messages.map((m: any) => `${m.role}:${m.content}`).join('|');
  // Simple hash — good enough for dedup
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export async function deadbandCheck(
  messages: any[],
  kv: KVNamespace,
  prefix: string
): Promise<{ hit: boolean; response?: string; hash: string }> {
  const hash = hashInput(messages);
  const key = `deadband:${prefix}:${hash}`;
  const cached = await kv.get(key, 'json') as DeadbandEntry | null;

  if (cached) {
    cached.hitCount++;
    await kv.put(key, JSON.stringify(cached), { expirationTtl: DEADBAND_TTL });
    return { hit: true, response: cached.response, hash };
  }

  return { hit: false, hash };
}

export async function deadbandStore(
  hash: string,
  response: string,
  kv: KVNamespace,
  prefix: string
): Promise<void> {
  const key = `deadband:${prefix}:${hash}`;
  const entry: DeadbandEntry = { hash, response, timestamp: Date.now(), hitCount: 0 };
  await kv.put(key, JSON.stringify(entry), { expirationTtl: DEADBAND_TTL });
}

export async function getEfficiencyStats(kv: KVNamespace, prefix: string): Promise<{
  totalCached: number;
  totalHits: number;
  cacheHitRate: number;
  entries: DeadbandEntry[];
}> {
  const list = await kv.list({ prefix: `deadband:${prefix}:`, limit: 100 });
  let totalHits = 0;
  const entries: DeadbandEntry[] = [];
  for (const key of list.keys) {
    const raw = await kv.get(key.name, 'json') as DeadbandEntry | null;
    if (raw) {
      totalHits += raw.hitCount;
      entries.push(raw);
    }
  }
  const totalCached = list.keys.length;
  return { totalCached, totalHits, cacheHitRate: totalCached > 0 ? totalHits / (totalCached + totalHits) : 0, entries };
}
