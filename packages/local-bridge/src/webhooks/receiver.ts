/**
 * Webhook receiver — HTTP endpoint for receiving external webhooks.
 *
 * Provides an HTTP server (or integrates with existing bridge server)
 * to receive webhooks from GitHub, Slack, Discord, etc.
 */

import { createLogger } from '../logger.js';
import { createServer, IncomingMessage, ServerResponse, RequestOptions } from 'http';
import { URL } from 'url';
import { WebhookManager } from './manager.js';
import { GitHubWebhookHandler } from './handlers/github.js';
import { SlackWebhookHandler } from './handlers/slack.js';
import { DiscordWebhookHandler } from './handlers/discord.js';

const logger = createLogger('webhooks:receiver');

/**
 * Webhook receiver configuration.
 */
export interface WebhookReceiverConfig {
  /** Port to listen on (default: 8788) */
  port?: number;
  /** Host to bind to (default: 0.0.0.0) */
  host?: string;
  /** Path prefix for webhook endpoints (default: /api/webhooks) */
  pathPrefix?: string;
}

/**
 * Webhook receiver HTTP server.
 */
export class WebhookReceiver {
  private server: ReturnType<typeof createServer> | null = null;
  private config: Required<WebhookReceiverConfig>;
  private webhookManager: WebhookManager;
  private githubHandler: GitHubWebhookHandler;
  private slackHandler: SlackWebhookHandler;
  private discordHandler: DiscordWebhookHandler | null = null;

  constructor(
    webhookManager: WebhookManager,
    config: WebhookReceiverConfig = {}
  ) {
    this.webhookManager = webhookManager;
    this.config = {
      port: config.port || 8788,
      host: config.host || 'localhost',
      pathPrefix: config.pathPrefix || '/api/webhooks',
    };
    this.githubHandler = new GitHubWebhookHandler();
    this.slackHandler = new SlackWebhookHandler();
    // Discord handler requires app ID and public key
    this.discordHandler = null;
  }

  /**
   * Set Discord handler (requires credentials).
   */
  setDiscordHandler(handler: DiscordWebhookHandler): void {
    this.discordHandler = handler;
  }

  /**
   * Start the webhook receiver server.
   */
  async start(): Promise<void> {
    if (this.server) {
      logger.warn('Webhook receiver already running');
      return;
    }

    this.server = createServer((req, res) => this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        logger.info('Webhook receiver started', {
          host: this.config.host,
          port: this.config.port,
          pathPrefix: this.config.pathPrefix,
        });
        resolve();
      });

      this.server!.on('error', (error) => {
        logger.error('Webhook receiver error', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the webhook receiver server.
   */
  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        logger.info('Webhook receiver stopped');
        this.server = null;
        resolve();
      });
    });
  }

  /**
   * Handle incoming HTTP request.
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url = new URL(req.url || '', `http://${req.headers.host}`);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Signature, X-Hub-Signature, X-Hub-Signature-256, X-Slack-Signature, X-Slack-Request-Timestamp');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      this.sendError(res, 405, 'Method Not Allowed');
      return;
    }

    const path = url.pathname;

    // Route to appropriate handler
    if (path.startsWith(`${this.config.pathPrefix}/github`)) {
      await this.handleGitHubWebhook(req, res);
    } else if (path.startsWith(`${this.config.pathPrefix}/slack`)) {
      await this.handleSlackWebhook(req, res);
    } else if (path.startsWith(`${this.config.pathPrefix}/discord`)) {
      await this.handleDiscordWebhook(req, res);
    } else if (path === `${this.config.pathPrefix}/trigger`) {
      await this.handleManualTrigger(req, res);
    } else {
      this.sendError(res, 404, 'Not Found');
    }
  }

  /**
   * Handle GitHub webhook.
   */
  private async handleGitHubWebhook(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const body = await this.readBody(req);

      // Verify signature
      const signature = req.headers['x-hub-signature-256'] as string ||
                        req.headers['x-hub-signature'] as string;
      if (!signature) {
        this.sendError(res, 401, 'Missing signature');
        return;
      }

      // Find webhook with matching secret
      const webhookId = req.headers['x-webhook-id'] as string;
      if (!webhookId) {
        this.sendError(res, 400, 'Missing webhook ID');
        return;
      }

      const webhook = this.webhookManager.getWebhook(webhookId);
      if (!webhook) {
        this.sendError(res, 404, 'Webhook not found');
        return;
      }

      const isValid = signature.startsWith('sha256=')
        ? GitHubWebhookHandler.verifySignature256(body, signature, webhook.secret)
        : GitHubWebhookHandler.verifySignature(body, signature, webhook.secret);

      if (!isValid) {
        this.sendError(res, 401, 'Invalid signature');
        return;
      }

      // Process webhook
      const eventType = req.headers['x-github-event'] as string;
      const payload = JSON.parse(body);
      const result = await this.githubHandler.handlePayload(eventType, payload);

      // Trigger Cocapn events
      for (const event of result.cocapnEvents) {
        await this.webhookManager.triggerEvent(event.type, event.payload);
      }

      this.sendJson(res, 200, { success: true, eventsTriggered: result.cocapnEvents.length });
    } catch (error) {
      logger.error('GitHub webhook error', error);
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  /**
   * Handle Slack webhook.
   */
  private async handleSlackWebhook(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const body = await this.readBody(req);

      // Verify signature
      const signature = req.headers['x-slack-signature'] as string;
      const timestamp = req.headers['x-slack-request-timestamp'] as string;

      if (!signature || !timestamp) {
        this.sendError(res, 401, 'Missing signature or timestamp');
        return;
      }

      // Verify timestamp (prevent replay attacks)
      if (!SlackWebhookHandler.verifyTimestamp(timestamp)) {
        this.sendError(res, 401, 'Invalid timestamp');
        return;
      }

      // Find webhook with matching secret
      const webhookId = req.headers['x-webhook-id'] as string;
      if (!webhookId) {
        this.sendError(res, 400, 'Missing webhook ID');
        return;
      }

      const webhook = this.webhookManager.getWebhook(webhookId);
      if (!webhook) {
        this.sendError(res, 404, 'Webhook not found');
        return;
      }

      const isValid = SlackWebhookHandler.verifySignature(body, signature, timestamp, webhook.secret);
      if (!isValid) {
        this.sendError(res, 401, 'Invalid signature');
        return;
      }

      // Parse payload (URL-encoded)
      const params = SlackWebhookHandler.parsePayload(body);

      if (params.payload) {
        // Interactive message
        const payload = JSON.parse(params.payload);
        const result = await this.slackHandler.handleInteraction(payload);

        // Trigger Cocapn events
        for (const event of result.cocapnEvents) {
          await this.webhookManager.triggerEvent(event.type, event.payload);
        }

        this.sendJson(res, 200, { success: true });
      } else if (params.command) {
        // Slash command
        const command: any = {
          command: params.command,
          text: params.text || '',
          user_id: params.user_id,
          user_name: params.user_name,
          channel_id: params.channel_id,
          channel_name: params.channel_name,
          team_id: params.team_id,
          team_domain: params.team_domain,
          response_url: params.response_url,
          trigger_id: params.trigger_id,
        };

        const result = await this.slackHandler.handleSlashCommand(command);

        // Trigger Cocapn events
        for (const event of result.cocapnEvents) {
          await this.webhookManager.triggerEvent(event.type, event.payload);
        }

        this.sendJson(res, 200, result.response || { success: true });
      } else {
        this.sendError(res, 400, 'Unknown payload type');
      }
    } catch (error) {
      logger.error('Slack webhook error', error);
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  /**
   * Handle Discord webhook.
   */
  private async handleDiscordWebhook(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (!this.discordHandler) {
      this.sendError(res, 501, 'Discord handler not configured');
      return;
    }

    try {
      const body = await this.readBody(req);

      // Verify signature
      const signature = req.headers['x-signature-ed25519'] as string;
      const timestamp = req.headers['x-signature-timestamp'] as string;

      if (!signature || !timestamp) {
        this.sendError(res, 401, 'Missing signature or timestamp');
        return;
      }

      // Find webhook with matching secret
      const webhookId = req.headers['x-webhook-id'] as string;
      if (!webhookId) {
        this.sendError(res, 400, 'Missing webhook ID');
        return;
      }

      const webhook = this.webhookManager.getWebhook(webhookId);
      if (!webhook) {
        this.sendError(res, 404, 'Webhook not found');
        return;
      }

      const isValid = DiscordWebhookHandler.verifySignature(body, signature, timestamp, webhook.secret);
      if (!isValid) {
        this.sendError(res, 401, 'Invalid signature');
        return;
      }

      // Process interaction
      const interaction = JSON.parse(body);
      const result = await this.discordHandler.handleInteraction(interaction);

      // Trigger Cocapn events
      for (const event of result.cocapnEvents) {
        await this.webhookManager.triggerEvent(event.type, event.payload);
      }

      this.sendJson(res, 200, result.response || { success: true });
    } catch (error) {
      logger.error('Discord webhook error', error);
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  /**
   * Handle manual event trigger (for testing).
   */
  private async handleManualTrigger(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    try {
      const body = await this.readBody(req);
      const { type, payload } = JSON.parse(body);

      if (!type) {
        this.sendError(res, 400, 'Missing event type');
        return;
      }

      const results = await this.webhookManager.triggerEvent(type, payload);
      this.sendJson(res, 200, { success: true, results });
    } catch (error) {
      logger.error('Manual trigger error', error);
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  /**
   * Read request body.
   */
  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response.
   */
  private sendJson(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response.
   */
  private sendError(res: ServerResponse, status: number, message: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
}
