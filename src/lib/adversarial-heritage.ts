// adversarial-heritage.ts — Every attack makes the fleet stronger
// Log attacks, vote on severity, embed top patterns as "immunity alleles"

export interface AttackEvent {
  id: string;
  type: 'prompt_injection' | 'data_poisoning' | 'jailbreak' | 'rate_abuse' | 'unknown';
  domain: string;
  payload: string;          // sanitized attack payload
  severity: number;         // 0-10, voted by quorum
  detection_method: string; // how we caught it
  timestamp: number;
  quorum_score: number;     // -1 to 1 (consensus of adversarial judges)
  immunized: boolean;       // has this pattern been embedded as allele?
}

export interface ImmunityAllele {
  pattern: string;          // regex or semantic fingerprint
  type: AttackEvent['type'];
  severity: number;
  response: 'block' | 'deflect' | 'honeytrap' | 'log_only';
  created: number;
  attack_count: number;     // how many times this pattern has been seen
  domains_affected: string[];
  description: string;
}

export interface HeritageQuorum {
  attacks: AttackEvent[];
  alleles: ImmunityAllele[];
  total_attacks_blocked: number;
  fleet_resilience_score: number; // 0-100
}

// Severity scoring by adversarial judges
// Each "judge" is a different detection heuristic
const JUDGES = {
  pattern_match: (payload: string): number => {
    // Known attack patterns
    const patterns = [
      /ignore previous/i, /system prompt/i, /you are now/i,
      /forget everything/i, /new instructions/i, /role:?/i,
      /<\|im_start\|>/i, /DAN/i, /jailbreak/i,
      /base64/i, /eval\(/i, /function\s*\(/i,
    ];
    const matches = patterns.filter(p => p.test(payload)).length;
    return Math.min(10, matches * 2);
  },
  
  length_anomaly: (payload: string): number => {
    // Unusually long inputs may be attack vectors
    if (payload.length > 5000) return 8;
    if (payload.length > 2000) return 5;
    if (payload.length > 1000) return 3;
    return 0;
  },
  
  entropy_check: (payload: string): number => {
    // High entropy = likely encoded/obfuscated payload
    const chars = new Set(payload.split(''));
    const ratio = chars.size / payload.length;
    if (ratio > 0.8 && payload.length > 100) return 7;
    if (ratio > 0.6 && payload.length > 200) return 4;
    return 0;
  },
  
  context_overflow: (payload: string): number => {
    // Attempts to fill context window
    const repeatPatterns = payload.match(/(.{20,})\1{3,}/);
    if (repeatPatterns) return 9;
    return 0;
  },
};

// Run all judges and compute quorum score
export function judgeAttack(payload: string): number {
  const scores = Object.values(JUDGES).map(judge => judge(payload));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  
  // Quorum: average weighted 2x with max (one judge seeing danger = worth investigating)
  return Math.round((avg * 0.6 + max * 0.4) * 10) / 10;
}

// Promote attack to immunity allele if quorum agrees it's severe enough
export function promoteToAllele(attack: AttackEvent): ImmunityAllele | null {
  if (attack.quorum_score < 0.3) return null; // Low consensus, skip
  if (attack.severity < 4) return null;        // Not severe enough
  
  return {
    pattern: attack.payload.slice(0, 200),     // Fingerprint
    type: attack.type,
    severity: attack.severity,
    response: attack.severity >= 8 ? 'block' : 
              attack.severity >= 6 ? 'deflect' : 
              attack.severity >= 4 ? 'honeytrap' : 'log_only',
    created: Date.now(),
    attack_count: 1,
    domains_affected: [attack.domain],
    description: `Quorum-scored ${attack.quorum_score}: ${attack.detection_method}`,
  };
}

// Check incoming request against all immunity alleles
// Returns the response action if a match is found
export function checkImmunity(
  payload: string,
  alleles: ImmunityAllele[]
): { match: boolean; response: ImmunityAllele['response']; allele?: ImmunityAllele } {
  for (const allele of alleles) {
    // Simple substring match (production would use semantic similarity)
    if (payload.toLowerCase().includes(allele.pattern.toLowerCase().slice(0, 50))) {
      return { match: true, response: allele.response, allele };
    }
  }
  return { match: false, response: 'log_only' };
}

// Compute fleet resilience score
// Higher = more attacks survived = stronger immune system
export function computeResilience(heritage: HeritageQuorum): number {
  if (heritage.attacks.length === 0) return 0;
  
  const blocked = heritage.attacks.filter(a => a.immunized).length;
  const coverage = heritage.alleles.length; // More alleles = broader immunity
  const recency = Math.max(...heritage.attacks.map(a => a.timestamp)) || 0;
  const daysSinceLastAttack = (Date.now() - recency) / 86400000;
  
  // Score components
  const blockRate = blocked / heritage.attacks.length; // 0-1
  const coverageScore = Math.min(1, coverage / 50);     // Saturates at 50 alleles
  const freshnessScore = Math.max(0, 1 - daysSinceLastAttack / 30); // Decays over 30 days
  
  return Math.round((blockRate * 40 + coverageScore * 30 + freshnessScore * 30));
}

// Top 1% most insidious attacks become alleles
// This is the "evolutionary pressure" — fleet gets harder to attack over time
export function selectTopPercentile(attacks: AttackEvent[]): AttackEvent[] {
  if (attacks.length < 100) return attacks.filter(a => a.severity >= 7);
  
  const sorted = [...attacks].sort((a, b) => b.severity - a.severity);
  const cutoff = Math.max(1, Math.ceil(sorted.length * 0.01));
  return sorted.slice(0, cutoff);
}
