/**
 * Discord webhook handler.
 *
 * Parses Discord interactions (slash commands, buttons, modals) and maps them to Cocapn events.
 */

import { createLogger } from '../../logger.js';
import type { DiscordInteraction } from '../types.js';

const logger = createLogger('webhooks:discord');

/**
 * Discord interaction types.
 */
export enum DiscordInteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

/**
 * Discord interaction callback types.
 */
export enum DiscordCallbackType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8,
  MODAL = 9,
}

/**
 * Discord webhook handler.
 */
export class DiscordWebhookHandler {
  private applicationId: string;
  private publicKey: string;
  private botToken?: string;

  constructor(applicationId: string, publicKey: string, botToken?: string) {
    this.applicationId = applicationId;
    this.publicKey = publicKey;
    this.botToken = botToken;
  }

  /**
   * Handle a Discord interaction.
   */
  async handleInteraction(interaction: DiscordInteraction): Promise<{
    cocapnEvents: Array<{ type: string; payload: unknown }>;
    response?: {
      type: number;
      data?: Record<string, unknown>;
    };
  }> {
    const cocapnEvents: Array<{ type: string; payload: unknown }> = [];

    try {
      switch (interaction.type) {
        case DiscordInteractionType.PING:
          // Respond with PONG
          return {
            cocapnEvents: [],
            response: { type: DiscordCallbackType.PONG },
          };

        case DiscordInteractionType.APPLICATION_COMMAND:
          // Slash command
          cocapnEvents.push({
            type: 'task.triggered',
            payload: {
              source: 'discord',
              commandName: interaction.data?.name,
              options: this.extractOptions(interaction.data?.options),
              userId: interaction.user?.id,
              userName: interaction.user?.username,
              guildId: interaction.guild_id,
              channelId: interaction.channel_id,
              interactionToken: interaction.token,
            },
          });
          break;

        case DiscordInteractionType.MESSAGE_COMPONENT:
          // Button or select menu interaction
          cocapnEvents.push({
            type: 'interaction.action',
            payload: {
              source: 'discord',
              customId: interaction.data?.name,
              userId: interaction.user?.id,
              userName: interaction.user?.username,
              guildId: interaction.guild_id,
              channelId: interaction.channel_id,
              interactionToken: interaction.token,
            },
          });
          break;

        case DiscordInteractionType.MODAL_SUBMIT:
          // Modal form submission
          cocapnEvents.push({
            type: 'form.submission',
            payload: {
              source: 'discord',
              customId: interaction.data?.name,
              userId: interaction.user?.id,
              userName: interaction.user?.username,
              guildId: interaction.guild_id,
              channelId: interaction.channel_id,
              interactionToken: interaction.token,
            },
          });
          break;

        default:
          logger.debug('Unknown Discord interaction type', {
            type: interaction.type,
          });
          break;
      }

      logger.info('Discord interaction processed', {
        type: interaction.type,
        user: interaction.user?.username,
      });

      // Defer response for commands that take time
      if (interaction.type === DiscordInteractionType.APPLICATION_COMMAND) {
        return {
          cocapnEvents,
          response: {
            type: DiscordCallbackType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
          },
        };
      }

      return { cocapnEvents };
    } catch (error) {
      logger.error('Failed to process Discord interaction', error, {
        type: interaction.type,
      });
      return { cocapnEvents: [] };
    }
  }

  /**
   * Extract options from interaction data.
   */
  private extractOptions(options?: Array<{ name: string; value: string }>): Record<string, string> {
    if (!options) return {};

    const result: Record<string, string> = {};
    for (const option of options) {
      result[option.name] = option.value;
    }
    return result;
  }

  /**
   * Verify Discord request signature.
   * Discord uses Ed25519 signatures.
   */
  static verifySignature(
    body: string,
    signature: string,
    timestamp: string,
    publicKey: string
  ): boolean {
    const crypto = require('crypto');

    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(timestamp);
      verify.update(body);
      return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
      logger.error('Failed to verify Discord signature', error);
      return false;
    }
  }

  /**
   * Send a follow-up message to an interaction.
   */
  async sendFollowUp(
    interactionToken: string,
    message: {
      content?: string;
      embeds?: Array<Record<string, unknown>>;
      flags?: number;
    }
  ): Promise<void> {
    if (!this.botToken) {
      throw new Error('Bot token required for follow-up messages');
    }

    try {
      const url = `https://discord.com/api/v10/webhooks/${this.applicationId}/${interactionToken}`;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${this.botToken}`,
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      logger.error('Failed to send Discord follow-up', error);
    }
  }

  /**
   * Edit an original interaction response.
   */
  async editOriginalResponse(
    interactionToken: string,
    message: {
      content?: string;
      embeds?: Array<Record<string, unknown>>;
      flags?: number;
    }
  ): Promise<void> {
    if (!this.botToken) {
      throw new Error('Bot token required for editing responses');
    }

    try {
      const url = `https://discord.com/api/v10/webhooks/${this.applicationId}/${interactionToken}/messages/@original`;
      await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${this.botToken}`,
        },
        body: JSON.stringify(message),
      });
    } catch (error) {
      logger.error('Failed to edit Discord response', error);
    }
  }

  /**
   * Send a deferred response with a loading message.
   */
  createDeferredResponse(): {
    type: number;
    data: { content: string };
  } {
    return {
      type: DiscordCallbackType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Processing your request...',
      },
    };
  }

  /**
   * Create an ephemeral response (only visible to the user).
   */
  createEphemeralResponse(content: string): {
    type: number;
    data: { content: string; flags: number };
  } {
    return {
      type: DiscordCallbackType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content,
        flags: 64, // EPHEMERAL flag
      },
    };
  }

  /**
   * Create a public channel response.
   */
  createChannelResponse(content: string): {
    type: number;
    data: { content: string };
  } {
    return {
      type: DiscordCallbackType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content,
      },
    };
  }

  /**
   * Create a modal response.
   */
  createModalResponse(modal: {
    custom_id: string;
    title: string;
    components: Array<Record<string, unknown>>;
  }): {
    type: number;
    data: typeof modal;
  } {
    return {
      type: DiscordCallbackType.MODAL,
      data: modal,
    };
  }
}
