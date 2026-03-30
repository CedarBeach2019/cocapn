/**
 * Slack webhook handler.
 *
 * Parses Slack slash commands and interactive messages, mapping them to Cocapn events.
 */

import { createLogger } from '../../logger.js';
import type {
  SlackSlashCommand,
  SlackInteractionPayload,
} from '../types.js';

const logger = createLogger('webhooks:slack');

/**
 * Slack webhook handler.
 */
export class SlackWebhookHandler {
  /**
   * Handle a Slack slash command.
   */
  async handleSlashCommand(command: SlackSlashCommand): Promise<{
    cocapnEvents: Array<{ type: string; payload: unknown }>;
    response?: { text: string; response_type?: string };
  }> {
    const cocapnEvents: Array<{ type: string; payload: unknown }> = [];

    try {
      switch (command.command) {
        case '/cocapn':
        case '/agent':
          // Generic agent command
          cocapnEvents.push({
            type: 'task.triggered',
            payload: {
              source: 'slack',
              command: command.command,
              text: command.text,
              userId: command.user_id,
              userName: command.user_name,
              channelId: command.channel_id,
              channelName: command.channel_name,
              teamId: command.team_id,
              teamDomain: command.team_domain,
              responseUrl: command.response_url,
            },
          });
          break;

        case '/ask':
          // Direct question to agent
          cocapnEvents.push({
            type: 'chat.message',
            payload: {
              source: 'slack',
              question: command.text,
              userId: command.user_id,
              userName: command.user_name,
              channelId: command.channel_id,
              responseUrl: command.response_url,
            },
          });
          break;

        case '/status':
          // Status check command
          cocapnEvents.push({
            type: 'system.status',
            payload: {
              source: 'slack',
              requestedBy: command.user_name,
              channelId: command.channel_id,
            },
          });
          break;

        default:
          logger.debug('Unknown Slack command', { command: command.command });
          break;
      }

      logger.info('Slash command processed', {
        command: command.command,
        user: command.user_name,
      });

      return {
        cocapnEvents,
        response: {
          text: 'Processing your command...',
          response_type: 'ephemeral',
        },
      };
    } catch (error) {
      logger.error('Failed to process slash command', error, {
        command: command.command,
      });
      return {
        cocapnEvents: [],
        response: {
          text: 'Sorry, there was an error processing your command.',
          response_type: 'ephemeral',
        },
      };
    }
  }

  /**
   * Handle a Slack interactive message (button click, modal submission, etc.).
   */
  async handleInteraction(payload: SlackInteractionPayload): Promise<{
    cocapnEvents: Array<{ type: string; payload: unknown }>;
    response?: unknown;
  }> {
    const cocapnEvents: Array<{ type: string; payload: unknown }> = [];

    try {
      switch (payload.type) {
        case 'shortcut':
          // Global shortcut or message shortcut
          cocapnEvents.push({
            type: 'task.triggered',
            payload: {
              source: 'slack',
              interactionType: 'shortcut',
              userId: payload.user.id,
              userName: payload.user.name,
              teamId: payload.team.id,
              triggerId: payload.trigger_id,
            },
          });
          break;

        case 'block_actions':
          // Button click or select menu interaction
          if (payload.actions && payload.actions.length > 0) {
            for (const action of payload.actions) {
              cocapnEvents.push({
                type: 'interaction.action',
                payload: {
                  source: 'slack',
                  actionId: action.action_id,
                  blockId: action.block_id,
                  value: action.value,
                  userId: payload.user.id,
                  userName: payload.user.name,
                  channelId: payload.channel?.id,
                  responseUrl: payload.response_url,
                },
              });
            }
          }
          break;

        case 'view_submission':
          // Modal form submission
          cocapnEvents.push({
            type: 'form.submission',
            payload: {
              source: 'slack',
              userId: payload.user.id,
              userName: payload.user.name,
              teamId: payload.team.id,
              // Form data would be in payload.view.state.values
            },
          });
          break;

        default:
          logger.debug('Unknown interaction type', { type: payload.type });
          break;
      }

      logger.info('Interaction processed', {
        type: payload.type,
        user: payload.user.name,
      });

      return { cocapnEvents };
    } catch (error) {
      logger.error('Failed to process interaction', error, {
        type: payload.type,
      });
      return { cocapnEvents: [] };
    }
  }

  /**
   * Parse URL-encoded payload from Slack.
   * Slack sends payloads as application/x-www-form-urlencoded.
   */
  static parsePayload(body: string): Record<string, string> {
    const params = new URLSearchParams(body);
    const result: Record<string, string> = {};

    for (const [key, value] of params.entries()) {
      result[key] = value;
    }

    return result;
  }

  /**
   * Verify Slack request timestamp.
   * Prevents replay attacks - requests older than 5 minutes are rejected.
   */
  static verifyTimestamp(timestamp: string): boolean {
    const requestTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.abs(now - requestTime);
    return diff < 300; // 5 minutes
  }

  /**
   * Verify Slack request signature.
   * Slack uses HMAC-SHA256 with the signing secret.
   */
  static verifySignature(
    body: string,
    signature: string,
    timestamp: string,
    signingSecret: string
  ): boolean {
    const crypto = require('crypto');

    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', signingSecret);
    hmac.update(baseString);
    const expected = 'v0=' + hmac.digest('hex');

    return signature === expected;
  }

  /**
   * Send a response to a Slack command or interaction.
   */
  static async sendResponse(responseUrl: string, message: {
    text: string;
    response_type?: 'in_channel' | 'ephemeral';
    attachments?: Array<unknown>;
    blocks?: Array<unknown>;
  }): Promise<void> {
    try {
      await fetch(responseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      logger.error('Failed to send Slack response', error);
    }
  }

  /**
   * Send an ephemeral message to a user.
   */
  static async sendEphemeral(
    responseUrl: string,
    text: string
  ): Promise<void> {
    await this.sendResponse(responseUrl, {
      text,
      response_type: 'ephemeral',
    });
  }

  /**
   * Send a message to a channel.
   */
  static async sendInChannel(
    responseUrl: string,
    text: string
  ): Promise<void> {
    await this.sendResponse(responseUrl, {
      text,
      response_type: 'in_channel',
    });
  }
}
