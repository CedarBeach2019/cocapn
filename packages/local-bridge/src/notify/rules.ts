/**
 * Notification rules — match agent events against user-defined rules.
 *
 * Rules specify which events trigger notifications and at what priority.
 * Stored in cocapn/notifications.json.
 */

/** Event types that can trigger notifications */
export type NotifyEventType =
  | "brain:update"
  | "chat:message"
  | "fleet:alert"
  | "sync:complete"
  | "error:critical";

export type NotifyPriority = "low" | "normal" | "high" | "critical";

export interface NotifyRule {
  /** Unique rule ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Event type(s) this rule matches */
  events: NotifyEventType[];
  /** Minimum priority to trigger (inclusive) */
  minPriority: NotifyPriority;
  /** Notification channels to use */
  channels: ("terminal" | "desktop" | "webhook")[];
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
}

export interface NotifyConfig {
  /** Whether notifications are globally enabled */
  enabled: boolean;
  /** Active notification rules */
  rules: NotifyRule[];
  /** Config update timestamp */
  updatedAt: number;
}

const PRIORITY_LEVELS: Record<NotifyPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  critical: 3,
};

const VALID_EVENTS: NotifyEventType[] = [
  "brain:update",
  "chat:message",
  "fleet:alert",
  "sync:complete",
  "error:critical",
];

const VALID_PRIORITIES: NotifyPriority[] = [
  "low",
  "normal",
  "high",
  "critical",
];

/** Check if a priority meets or exceeds a minimum threshold */
export function meetsPriority(
  priority: NotifyPriority,
  minPriority: NotifyPriority,
): boolean {
  return PRIORITY_LEVELS[priority] >= PRIORITY_LEVELS[minPriority];
}

/** Validate that an event type string is recognized */
export function isValidEventType(event: string): event is NotifyEventType {
  return VALID_EVENTS.includes(event as NotifyEventType);
}

/** Validate that a priority string is recognized */
export function isValidPriority(p: string): p is NotifyPriority {
  return VALID_PRIORITIES.includes(p as NotifyPriority);
}

/** Get the list of all valid event types */
export function getValidEvents(): NotifyEventType[] {
  return [...VALID_EVENTS];
}

/** Get the list of all valid priorities */
export function getValidPriorities(): NotifyPriority[] {
  return [...VALID_PRIORITIES];
}

/** Create an empty default config */
export function createDefaultConfig(): NotifyConfig {
  return {
    enabled: false,
    rules: [],
    updatedAt: Date.now(),
  };
}

export interface AgentEvent {
  type: NotifyEventType;
  priority: NotifyPriority;
  message: string;
  timestamp: number;
}

/** Find all rules that match a given event */
export function matchRules(
  rules: NotifyRule[],
  event: AgentEvent,
): NotifyRule[] {
  return rules.filter(
    (rule) =>
      rule.enabled &&
      rule.events.includes(event.type) &&
      meetsPriority(event.priority, rule.minPriority),
  );
}
