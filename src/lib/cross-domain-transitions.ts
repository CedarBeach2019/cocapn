// cross-domain-transitions.ts — Track user transitions BETWEEN domains
// This is the "behavioral silhouette" detector — the psychic anatomy of cross-domain intent

export interface TransitionEvent {
  from: string;      // source domain
  to: string;        // destination domain
  timestamp: number;
  sessionId: string;
  metadata?: {
    topic?: string;
    duration_ms?: number;  // time spent in source before transition
    trigger?: string;      // what prompted the transition (link, search, direct nav)
  };
}

export interface DomainProfile {
  domain: string;
  visits: number;
  avgDuration: number;
  commonExits: { domain: string; count: number; pct: number }[];
  commonEntrances: { domain: string; count: number; pct: number }[];
  peakHour: number;       // 0-23
  topicClusters: string[];
  silhouetteScore: number; // how much this domain reveals about user
}

// SimHash-like fingerprint for cross-domain patterns
// Two users with similar transition patterns get similar fingerprints
// even if they visit different domains — the PATTERN matters, not the domains
export function transitionFingerprint(transitions: TransitionEvent[]): string {
  if (transitions.length === 0) return '0';
  
  // Simple hash: encode transition pairs into a bit vector
  const pairs = transitions.map(t => `${t.from}->${t.to}`);
  const unique = [...new Set(pairs)];
  
  // Create a 64-bit fingerprint
  let hash = 0n;
  for (const pair of unique) {
    for (let i = 0; i < pair.length; i++) {
      hash = ((hash << 5n) - hash + BigInt(pair.charCodeAt(i))) & 0xFFFFFFFFFFFFFFFFn;
    }
  }
  return hash.toString(16).padStart(16, '0');
}

// Compute silhouette — how predictable is this user's cross-domain behavior?
// High silhouette = user has strong patterns = more context = more value
export function computeSilhouette(transitions: TransitionEvent[]): number {
  if (transitions.length < 3) return 0;
  
  // Count transition pairs
  const pairCounts = new Map<string, number>();
  for (const t of transitions) {
    const key = `${t.from}->${t.to}`;
    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
  }
  
  // Entropy of transition distribution
  const total = transitions.length;
  let entropy = 0;
  for (const count of pairCounts.values()) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  
  // Max entropy = log2(unique pairs)
  const maxEntropy = Math.log2(pairCounts.size);
  if (maxEntropy === 0) return 1;
  
  // Silhouette = 1 - normalized entropy (1 = very predictable, 0 = random)
  return Math.max(0, Math.min(1, 1 - (entropy / maxEntropy)));
}

// Build domain profile from transition history
export function buildDomainProfile(
  domain: string, 
  transitions: TransitionEvent[]
): DomainProfile {
  const toDomain = transitions.filter(t => t.to === domain);
  const fromDomain = transitions.filter(t => t.from === domain);
  
  // Common exits (where users go FROM this domain)
  const exitCounts = new Map<string, number>();
  for (const t of fromDomain) {
    exitCounts.set(t.to, (exitCounts.get(t.to) || 0) + 1);
  }
  const totalExits = fromDomain.length || 1;
  const commonExits = [...exitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d, c]) => ({ domain: d, count: c, pct: Math.round(c / totalExits * 100) }));
  
  // Common entrances (where users come FROM to this domain)
  const entryCounts = new Map<string, number>();
  for (const t of toDomain) {
    entryCounts.set(t.from, (entryCounts.get(t.from) || 0) + 1);
  }
  const totalEntries = toDomain.length || 1;
  const commonEntrances = [...entryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d, c]) => ({ domain: d, count: c, pct: Math.round(c / totalEntries * 100) }));
  
  // Peak hour
  const hours = toDomain.map(t => new Date(t.timestamp).getHours());
  const hourCounts = new Array(24).fill(0);
  hours.forEach(h => hourCounts[h]++);
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  
  return {
    domain,
    visits: toDomain.length,
    avgDuration: fromDomain.reduce((sum, t) => sum + (t.metadata?.duration_ms || 0), 0) / (fromDomain.length || 1),
    commonExits,
    commonEntrances,
    peakHour,
    topicClusters: [], // populated by topic extraction
    silhouetteScore: computeSilhouette(transitions),
  };
}

// Predict next domain based on transition patterns
// This is the "intent graph" — understanding vectors BETWEEN buckets
export function predictNextDomain(
  currentDomain: string,
  transitions: TransitionEvent[]
): { domain: string; confidence: number }[] {
  const fromCurrent = transitions.filter(t => t.from === currentDomain);
  if (fromCurrent.length === 0) return [];
  
  const counts = new Map<string, number>();
  for (const t of fromCurrent) {
    counts.set(t.to, (counts.get(t.to) || 0) + 1);
  }
  
  const total = fromCurrent.length;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({
      domain,
      confidence: Math.round(count / total * 100) / 100,
    }));
}
