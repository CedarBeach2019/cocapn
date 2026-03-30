/**
 * Cloud Bridge MCP Tools
 *
 * Exposes CloudBridge functionality as MCP tools for use with BrainMCPServer.
 *
 * Tools:
 *   - cloud_chat: Send a message to cloud AI (streaming or non-streaming)
 *   - cloud_models: List available models
 *   - cloud_usage: Get usage statistics
 */

import { MCPServer } from '../../../protocols/src/mcp/server.js';
import type { McpTool } from '../../../protocols/src/mcp/types.js';
import { CloudBridge } from './index.js';
import type { ChatMessage } from './config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudBridgeMcpToolsOptions {
  bridge: CloudBridge;
}

// ─── CloudBridgeMcpTools ───────────────────────────────────────────────────────

export class CloudBridgeMcpTools extends MCPServer {
  private bridge: CloudBridge;

  constructor(options: CloudBridgeMcpToolsOptions) {
    super({
      serverInfo: {
        name: 'cocapn-cloud-bridge',
        version: '0.1.0',
      },
      capabilities: {
        tools: {},
      },
    });
    this.bridge = options.bridge;
    this.registerTools();
  }

  private registerTools(): void {
    // cloud_chat — send message to cloud AI
    this.registerTool(
      {
        name: 'cloud_chat',
        description: 'Send a chat message to the cloud AI and get a response. Supports both streaming and non-streaming modes.',
        title: 'Cloud Chat',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The user message to send to the cloud AI',
            },
            stream: {
              type: 'boolean',
              description: 'Whether to stream the response (default: false)',
            },
            model: {
              type: 'string',
              description: 'Optional model override (e.g., "claude-3-opus", "deepseek-chat")',
            },
            temperature: {
              type: 'number',
              description: 'Temperature for response randomness (0.0-1.0, default: 0.7)',
            },
          },
          required: ['message'],
        },
        annotations: {
          audience: ['user', 'assistant'],
          priority: 0.9,
        },
      },
      async (params) => {
        const { message, stream = false, model, temperature } = params.arguments ?? {};

        if (typeof message !== 'string') {
          return {
            content: [
              { type: 'text', text: 'Error: message must be a string' },
            ],
            isError: true,
          };
        }

        try {
          const messages: ChatMessage[] = [
            { role: 'user', content: message },
          ];

          if (stream) {
            // Streaming mode: collect chunks
            let fullResponse = '';
            for await (const chunk of this.bridge.chat(messages, { stream: true, model, temperature })) {
              fullResponse += chunk;
            }
            return {
              content: [
                { type: 'text', text: fullResponse },
              ],
              isError: false,
            };
          } else {
            // Non-streaming mode
            const completion = await this.bridge.complete(messages, { stream: false, model, temperature });
            const content = completion.choices[0]?.message?.content ?? '';
            return {
              content: [
                { type: 'text', text: content },
              ],
              isError: false,
            };
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              { type: 'text', text: `Error: ${errorMsg}` },
            ],
            isError: true,
          };
        }
      }
    );

    // cloud_models — list available models
    this.registerTool(
      {
        name: 'cloud_models',
        description: 'List all available AI models from the cloud worker.',
        title: 'List Cloud Models',
        inputSchema: {
          type: 'object',
          properties: {},
        },
        annotations: {
          audience: ['user', 'assistant'],
          priority: 0.6,
        },
      },
      async () => {
        try {
          const models = await this.bridge.listModels();
          const text = models.map((m) => `- ${m.id}: ${m.name}${m.description ? ` — ${m.description}` : ''}`).join('\n');
          return {
            content: [
              { type: 'text', text: `Available models:\n${text}` },
            ],
            isError: false,
          };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              { type: 'text', text: `Error: ${errorMsg}` },
            ],
            isError: true,
          };
        }
      }
    );

    // cloud_usage — get usage statistics
    this.registerTool(
      {
        name: 'cloud_usage',
        description: 'Get current usage statistics including token counts and request count.',
        title: 'Cloud Usage Stats',
        inputSchema: {
          type: 'object',
          properties: {
            reset: {
              type: 'boolean',
              description: 'Whether to reset the stats after reading (default: false)',
            },
          },
        },
        annotations: {
          audience: ['user', 'assistant'],
          priority: 0.5,
        },
      },
      async (params) => {
        const { reset = false } = params.arguments ?? {};

        try {
          const usage = await this.bridge.getUsage();
          const text = [
            `Total tokens: ${usage.totalTokens}`,
            `Prompt tokens: ${usage.promptTokens}`,
            `Completion tokens: ${usage.completionTokens}`,
            `Request count: ${usage.requestCount}`,
          ].join('\n');

          if (reset) {
            this.bridge.resetUsage();
          }

          return {
            content: [
              { type: 'text', text: `Cloud usage:\n${text}${reset ? '\n\nStats reset.' : ''}` },
            ],
            isError: false,
          };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              { type: 'text', text: `Error: ${errorMsg}` },
            ],
            isError: true,
          };
        }
      }
    );
  }
}
