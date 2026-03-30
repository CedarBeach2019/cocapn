/**
 * Webhook types for Cocapn webhook system.
 *
 * Provides types for webhooks, events, and deliveries.
 */

/**
 * Webhook configuration.
 * Stored in ~/.cocapn/webhooks.json.
 */
export interface Webhook {
  /** Unique webhook ID (UUID) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Target URL for webhook delivery */
  url: string;
  /** Event types that trigger this webhook */
  events: string[];
  /** HMAC secret for signature verification (base64) */
  secret: string;
  /** Whether webhook is enabled */
  enabled: boolean;
  /** Creation timestamp (Unix ms) */
  createdAt: number;
  /** Last successful delivery timestamp (Unix ms) */
  lastTriggered?: number;
  /** Number of successful deliveries */
  successCount: number;
  /** Number of failed deliveries */
  failureCount: number;
}

/**
 * Internal event that triggers webhooks.
 * These are emitted by the bridge and consumed by webhooks.
 */
export interface WebhookEvent {
  /** Unique event ID (UUID) */
  id: string;
  /** Event type (e.g., 'skill.loaded', 'task.completed', 'brain.write') */
  type: string;
  /** Event payload (event-specific data) */
  payload: unknown;
  /** Event timestamp (Unix ms) */
  timestamp: number;
}

/**
 * Webhook delivery attempt record.
 * Tracks the status and results of webhook deliveries.
 */
export interface WebhookDelivery {
  /** Unique delivery ID (UUID) */
  id: string;
  /** ID of the webhook being delivered to */
  webhookId: string;
  /** ID of the event being delivered */
  eventId: string;
  /** Delivery status */
  status: 'pending' | 'success' | 'failed';
  /** HTTP response code (if delivered) */
  responseCode?: number;
  /** HTTP response body (truncated) */
  responseBody?: string;
  /** Number of delivery attempts */
  attempts: number;
  /** Delivery creation timestamp (Unix ms) */
  createdAt: number;
}

/**
 * Result of a webhook delivery attempt.
 */
export interface WebhookDeliveryResult {
  /** Whether delivery was successful */
  success: boolean;
  /** HTTP response code (if delivered) */
  statusCode?: number;
  /** Response body (if any) */
  body?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * GitHub webhook payload types.
 */
export interface GitHubPushEvent {
  ref: string;
  repository: {
    name: string;
    full_name: string;
    html_url: string;
  };
  pusher: {
    name: string;
    email: string;
  };
  commits: Array<{
    id: string;
    message: string;
    added: string[];
    removed: string[];
    modified: string[];
  }>;
}

export interface GitHubPullRequestEvent {
  action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'edited';
  pull_request: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    user: {
      login: string;
    };
    base: {
      ref: string;
      repo: {
        name: string;
        full_name: string;
      };
    };
    head: {
      ref: string;
      repo: {
        name: string;
        full_name: string;
      };
    };
  };
  repository: {
    name: string;
    full_name: string;
    html_url: string;
  };
}

export interface GitHubIssuesEvent {
  action: 'opened' | 'closed' | 'reopened' | 'edited' | 'labeled' | 'unlabeled';
  issue: {
    number: number;
    title: string;
    body: string | null;
    html_url: string;
    user: {
      login: string;
    };
    labels: Array<{
      name: string;
    }>;
  };
  repository: {
    name: string;
    full_name: string;
    html_url: string;
  };
}

/**
 * Slack webhook payload types.
 */
export interface SlackSlashCommand {
  command: string;
  text: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  channel_name: string;
  team_id: string;
  team_domain: string;
  response_url: string;
  trigger_id: string;
}

export interface SlackInteractionPayload {
  type: 'shortcut' | 'block_actions' | 'view_submission' | 'interaction';
  user: {
    id: string;
    name: string;
  };
  channel?: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    domain: string;
  };
  trigger_id?: string;
  response_url?: string;
  actions?: Array<{
    action_id: string;
    block_id: string;
    value?: string;
  }>;
}

/**
 * Discord webhook payload types.
 */
export interface DiscordInteraction {
  id: string;
  type: 1 | 2 | 3;
  token: string;
  data?: {
    name: string;
    options?: Array<{
      name: string;
      value: string;
    }>;
  };
  guild_id?: string;
  channel_id?: string;
  user?: {
    id: string;
    username: string;
    discriminator: string;
  };
  version: number;
}

/**
 * Mapped event types from external webhooks.
 * These are the event types that webhooks can subscribe to.
 */
export const CocapnEventType = {
  // Skill events
  SKILL_LOADED: 'skill.loaded',
  SKILL_UNLOADED: 'skill.unloaded',
  SKILL_EXECUTED: 'skill.executed',

  // Task events
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_TRIGGERED: 'task.triggered',

  // Brain events
  BRAIN_WRITE: 'brain.write',
  BRAIN_READ: 'brain.read',

  // Tree search events
  TREE_SEARCH_COMPLETED: 'tree_search.completed',
  TREE_SEARCH_FAILED: 'tree_search.failed',

  // Error events
  ERROR: 'error',

  // External webhook events
  GITHUB_PUSH: 'github.push',
  GITHUB_PR: 'github.pull_request',
  GITHUB_ISSUE: 'github.issue',
  SLACK_COMMAND: 'slack.command',
  SLACK_INTERACTION: 'slack.interaction',
  DISCORD_INTERACTION: 'discord.interaction',
} as const;

export type CocapnEventType = typeof CocapnEventType[keyof typeof CocapnEventType];
