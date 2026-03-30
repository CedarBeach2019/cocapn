/**
 * E2E Test Helpers
 *
 * Common utilities for end-to-end testing of the cocapn bridge.
 * Provides bridge creation, WebSocket clients, and test utilities.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { simpleGit, SimpleGit } from 'simple-git';
import WebSocket from 'ws';
import { BridgeServer } from '../../src/ws/server.js';
import { AgentSpawner } from '../../src/agents/spawner.js';
import { AgentRegistry } from '../../src/agents/registry.js';
import { AgentRouter } from '../../src/agents/router.js';
import { GitSync } from '../../src/git/sync.js';
import { Brain } from '../../src/brain/index.js';
import { ConversationMemory } from '../../src/brain/conversation-memory.js';
import { SkillLoader } from '../../src/skills/loader.js';
import { SkillDecisionTree } from '../../src/skills/decision-tree.js';
import { DEFAULT_CONFIG, type BridgeConfig } from '../../src/config/types.js';

// Port management for parallel test execution
const BASE_PORT = 30000;
let portOffset = Math.floor(Math.random() * 10000);

export function getNextPort(): number {
  return BASE_PORT + portOffset++;
}

export interface TestBridge {
  server: BridgeServer;
  sync: GitSync;
  spawner: AgentSpawner;
  registry: AgentRegistry;
  router: AgentRouter;
  config: BridgeConfig;
  repoDir: string;
  port: number;
}

export interface TestRepoOptions {
  hasPackageJson?: boolean;
  hasSrcDir?: boolean;
  hasTests?: boolean;
  files?: Record<string, string>;
}

/**
 * Create a temporary git repository for testing
 */
export async function createTestRepo(options: TestRepoOptions = {}): Promise<string> {
  const repoDir = mkdtempSync(join(tmpdir(), 'cocapn-e2e-'));
  const git = simpleGit(repoDir);

  // Initialize git repo
  await git.init();
  await git.addConfig('user.name', 'E2E Test');
  await git.addConfig('user.email', 'e2e@test.com');

  // Create basic structure
  if (options.hasPackageJson !== false) {
    writeFileSync(
      join(repoDir, 'package.json'),
      JSON.stringify({
        name: 'test-repo',
        version: '1.0.0',
        description: 'Test repository for E2E tests',
      }, null, 2)
    );
  }

  // Create src directory if requested
  if (options.hasSrcDir) {
    const srcDir = join(repoDir, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(
      join(srcDir, 'index.ts'),
      'export function main() {\n  console.log("Hello, world!");\n}\n'
    );
  }

  // Create tests directory if requested
  if (options.hasTests) {
    const testsDir = join(repoDir, 'tests');
    mkdirSync(testsDir, { recursive: true });
    writeFileSync(
      join(testsDir, 'example.test.ts'),
      'import { describe, it, expect } from "vitest";\n\ndescribe("example", () => {\n  it("should pass", () => {\n    expect(true).toBe(true);\n  });\n});\n'
    );
  }

  // Create additional files if specified
  if (options.files) {
    for (const [filePath, content] of Object.entries(options.files)) {
      const fullPath = join(repoDir, filePath);
      const dir = join(fullPath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, content);
    }
  }

  // Create README
  writeFileSync(
    join(repoDir, 'README.md'),
    '# Test Repository\n\nThis is a test repository for E2E testing.\n'
  );

  // Ignore transient graph database files to avoid race conditions with git add
  writeFileSync(
    join(repoDir, '.gitignore'),
    '.cocapn/graph.db*\nnode_modules/\n',
  );

  // Initial commit
  await git.add('.');
  await git.commit('Initial commit');

  return repoDir;
}

/**
 * Create a cocapn config directory structure
 */
export function createCocapnConfig(repoDir: string, config: Partial<BridgeConfig> = {}): void {
  const cocapnDir = join(repoDir, 'cocapn');
  mkdirSync(cocapnDir, { recursive: true });

  // Create config.yml
  const configContent = {
    mode: 'local',
    port: 8787,
    soul: 'cocapn/soul.md',
    memory: {
      facts: 'cocapn/memory/facts.json',
      wiki: 'cocapn/memory/wiki.md',
      soul: 'cocapn/memory/soul.md',
      procedures: 'cocapn/memory/procedures.md',
    },
    ...config,
  };

  writeFileSync(
    join(cocapnDir, 'config.yml'),
    Object.entries(configContent)
      .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
      .join('\n') + '\n'
  );

  // Create soul.md
  writeFileSync(
    join(cocapnDir, 'soul.md'),
    '# Test Agent\n\nYou are a helpful test assistant for E2E testing.\n'
  );

  // Create memory directory
  const memoryDir = join(cocapnDir, 'memory');
  mkdirSync(memoryDir, { recursive: true });

  writeFileSync(join(memoryDir, 'facts.json'), JSON.stringify({}, null, 2));
  writeFileSync(join(memoryDir, 'wiki.md'), '# Wiki\n\n');
  writeFileSync(join(memoryDir, 'soul.md'), '# Soul\n\n');
  writeFileSync(join(memoryDir, 'procedures.md'), '# Procedures\n\n');
}

/**
 * Create a test bridge server
 */
export async function createTestBridge(options: {
  port?: number;
  config?: Partial<BridgeConfig>;
  skipAuth?: boolean;
} = {}): Promise<TestBridge> {
  const port = options.port ?? getNextPort();
  const repoDir = await createTestRepo({
    hasPackageJson: true,
    hasSrcDir: true,
    hasTests: true,
  });

  createCocapnConfig(repoDir, options.config);

  const config: BridgeConfig = {
    ...DEFAULT_CONFIG,
    ...options.config,
    config: {
      ...DEFAULT_CONFIG.config,
      port,
      ...options.config,
    },
  };

  const sync = new GitSync(repoDir, config);
  const spawner = new AgentSpawner();
  const registry = new AgentRegistry();
  const router = new AgentRouter(
    {
      rules: [],
      strategy: 'first-match',
      defaultAgent: undefined,
      fallbackAgent: undefined,
    },
    registry,
    spawner
  );

  const server = new BridgeServer({
    config,
    router,
    spawner,
    sync,
    repoRoot: repoDir,
    skipAuth: options.skipAuth ?? true,
    cloudAdapters: undefined,
    moduleManager: undefined,
    fleetKey: undefined,
  });

  return {
    server,
    sync,
    spawner,
    registry,
    router,
    config,
    repoDir,
    port,
  };
}

/**
 * Start a test bridge and wait for it to be ready
 */
export async function startTestBridge(bridge: TestBridge): Promise<void> {
  bridge.server.start();
  await new Promise<void>((resolve, reject) => {
    bridge.server.once('listening', resolve);
    bridge.server.once('error', reject);
    setTimeout(() => reject(new Error('Bridge startup timeout')), 10000);
  });
}

/**
 * Stop a test bridge and clean up resources
 */
export async function stopTestBridge(bridge: TestBridge): Promise<void> {
  bridge.sync.stopTimers();
  await bridge.server.stop();
  rmSync(bridge.repoDir, { recursive: true, force: true });
}

/**
 * Create a WebSocket client connected to the bridge
 */
export async function createWsClient(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://localhost:${port}`);

  await Promise.all([
    new Promise<void>((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    }),
    new Promise<void>((resolve) => ws.once('message', () => resolve())),
  ]);

  return ws;
}

/**
 * Close a WebSocket client
 */
export async function closeWsClient(ws: WebSocket): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
    await new Promise<void>((resolve) => ws.once('close', resolve));
  }
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc?: '2.0';
  id?: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface TypedMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Send a JSON-RPC request and wait for the response
 */
export async function sendJsonRpc<T = unknown>(
  ws: WebSocket,
  id: number,
  method: string,
  params: unknown = {}
): Promise<JsonRpcResponse<T>> {
  return new Promise((resolve, reject) => {
    const handler = (data: unknown) => {
      try {
        const response = JSON.parse((data as Buffer).toString()) as JsonRpcResponse<T>;
        if (response.id === id) {
          ws.off('message', handler);
          resolve(response);
        }
      } catch (e) {
        ws.off('message', handler);
        reject(e);
      }
    };

    ws.on('message', handler);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    ws.send(JSON.stringify(request));

    setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`JSON-RPC request timeout for ${method}`));
    }, 5000);
  });
}

/**
 * Send a typed message and wait for a response
 */
export async function sendTypedMessage<T extends TypedMessage>(
  ws: WebSocket,
  message: TypedMessage,
  expectedType: string,
  timeout: number = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (data: unknown) => {
      try {
        const msg = JSON.parse((data as Buffer).toString()) as TypedMessage;
        if (msg.type === expectedType) {
          ws.off('message', handler);
          resolve(msg as T);
        }
      } catch (e) {
        ws.off('message', handler);
        reject(e);
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(message));

    setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Typed message timeout, expected type: ${expectedType}`));
    }, timeout);
  });
}

/**
 * Wait for a message of a specific type
 */
export async function waitForMessage<T extends TypedMessage>(
  ws: WebSocket,
  expectedType: string,
  timeout: number = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (data: unknown) => {
      try {
        const msg = JSON.parse((data as Buffer).toString()) as TypedMessage;
        if (msg.type === expectedType) {
          ws.off('message', handler);
          resolve(msg as T);
        }
      } catch (e) {
        ws.off('message', handler);
        reject(e);
      }
    };

    ws.on('message', handler);

    setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Message timeout, expected type: ${expectedType}`));
    }, timeout);
  });
}

/**
 * Collect all messages of a specific type until a condition is met
 */
export async function collectMessages<T extends TypedMessage>(
  ws: WebSocket,
  expectedType: string,
  condition: (messages: T[]) => boolean = () => false,
  timeout: number = 5000
): Promise<T[]> {
  const messages: T[] = [];

  return new Promise((resolve, reject) => {
    const handler = (data: unknown) => {
      try {
        const msg = JSON.parse((data as Buffer).toString()) as TypedMessage;
        if (msg.type === expectedType) {
          messages.push(msg as T);
          if (condition(messages)) {
            ws.off('message', handler);
            resolve(messages);
          }
        }
      } catch (e) {
        ws.off('message', handler);
        reject(e);
      }
    };

    ws.on('message', handler);

    setTimeout(() => {
      ws.off('message', handler);
      if (messages.length > 0) {
        resolve(messages);
      } else {
        reject(new Error(`No messages received, expected type: ${expectedType}`));
      }
    }, timeout);
  });
}

/**
 * Create a mock AI response for testing
 */
export function mockAiResponse(text: string): {
  type: string;
  content: string;
  done: boolean;
} {
  return {
    type: 'CHAT_CHUNK',
    content: text,
    done: true,
  };
}

/**
 * Create a test skill cartridge
 */
export function createTestSkill(name: string, overrides: Partial<import('../../src/skills/types.js').SkillCartridge> = {}): import('../../src/skills/types.js').SkillCartridge {
  return {
    name,
    version: '1.0.0',
    description: `Test skill: ${name}`,
    triggers: [name],
    category: 'test',
    steps: [
      {
        action: 'test',
        description: `Test action for ${name}`,
      },
    ],
    hot: false,
    tokenBudget: 500,
    ...overrides,
  };
}

/**
 * Assert that a bridge status response is valid
 */
export async function assertBridgeStatus(ws: WebSocket, expectedPort: number): Promise<void> {
  const response = await sendJsonRpc<{ port: number; agentCount: number }>(ws, 1, 'bridge/status');

  if (response.error) {
    throw new Error(`Bridge status failed: ${response.error.message}`);
  }

  if (!response.result) {
    throw new Error('Bridge status returned no result');
  }

  if (response.result.port !== expectedPort) {
    throw new Error(`Expected port ${expectedPort}, got ${response.result.port}`);
  }

  if (typeof response.result.agentCount !== 'number') {
    throw new Error(`Invalid agent count: ${response.result.agentCount}`);
  }
}

// ─── Extended test bridge with optional services ──────────────────────────────

export interface TestBridgeWithServices extends TestBridge {
  brain?: Brain;
  skillLoader?: SkillLoader;
  conversationMemory?: ConversationMemory;
  decisionTree?: SkillDecisionTree;
}

/**
 * Stop a test bridge without deleting the repo directory.
 * Use this when you need to reuse the repo for another bridge instance.
 */
export async function stopBridgeNoCleanup(bridge: TestBridge): Promise<void> {
  bridge.sync.stopTimers();
  await bridge.server.stop();
}

/**
 * Create a test bridge with Brain and ConversationMemory wired in.
 * All MEMORY_ADD / MEMORY_LIST typed messages will work against real on-disk storage.
 *
 * @param options.repoDir - If provided, reuse this directory instead of creating a new one.
 */
export async function createTestBridgeWithBrain(options: {
  port?: number;
  skipAuth?: boolean;
  repoDir?: string;
} = {}): Promise<TestBridgeWithServices> {
  const port = options.port ?? getNextPort();
  let repoDir: string;

  if (options.repoDir) {
    repoDir = options.repoDir;
  } else {
    repoDir = await createTestRepo({ hasPackageJson: true, hasSrcDir: true, hasTests: true });
    createCocapnConfig(repoDir);
  }

  // Config paths must match where createCocapnConfig actually writes files
  const config: BridgeConfig = {
    ...DEFAULT_CONFIG,
    soul: 'cocapn/soul.md',
    memory: {
      ...DEFAULT_CONFIG.memory,
      facts: 'cocapn/memory/facts.json',
    },
    config: { ...DEFAULT_CONFIG.config, port },
  };

  const sync = new GitSync(repoDir, config);
  const spawner = new AgentSpawner();
  const registry = new AgentRegistry();
  const router = new AgentRouter(
    { rules: [], strategy: 'first-match', defaultAgent: undefined, fallbackAgent: undefined },
    registry,
    spawner,
  );

  const brain = new Brain(repoDir, config, sync);
  const conversationMemory = new ConversationMemory(brain);

  const server = new BridgeServer({
    config, router, spawner, sync,
    repoRoot: repoDir,
    skipAuth: options.skipAuth ?? true,
    brain,
    conversationMemory,
  });

  return { server, sync, spawner, registry, router, config, repoDir, port, brain, conversationMemory };
}

/**
 * Create a test bridge with SkillLoader and SkillDecisionTree wired in.
 * All skill/* JSON-RPC methods will work against real skill registrations.
 *
 * @param options.skillFiles - Map of file path (relative to repo) to skill JSON objects.
 *   Each file is written to disk and registered with the SkillLoader.
 */
export async function createTestBridgeWithSkills(options: {
  port?: number;
  skipAuth?: boolean;
  skillFiles?: Record<string, Record<string, unknown>>;
} = {}): Promise<TestBridgeWithServices> {
  const port = options.port ?? getNextPort();
  const repoDir = await createTestRepo({ hasPackageJson: true, hasSrcDir: true, hasTests: true });
  createCocapnConfig(repoDir);

  const config: BridgeConfig = {
    ...DEFAULT_CONFIG,
    config: { ...DEFAULT_CONFIG.config, port },
  };

  const sync = new GitSync(repoDir, config);
  const spawner = new AgentSpawner();
  const registry = new AgentRegistry();
  const router = new AgentRouter(
    { rules: [], strategy: 'first-match', defaultAgent: undefined, fallbackAgent: undefined },
    registry,
    spawner,
  );

  const skillLoader = new SkillLoader({ skillPaths: [] });
  const decisionTree = new SkillDecisionTree();

  // Register skill files on disk and in the loader
  if (options.skillFiles) {
    for (const [filePath, skillJson] of Object.entries(options.skillFiles)) {
      const fullPath = join(repoDir, filePath);
      const dir = join(fullPath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fullPath, JSON.stringify(skillJson));
      await skillLoader.register(fullPath);
    }
  }

  const server = new BridgeServer({
    config, router, spawner, sync,
    repoRoot: repoDir,
    skipAuth: options.skipAuth ?? true,
    skillLoader,
    decisionTree,
  });

  return { server, sync, spawner, registry, router, config, repoDir, port, skillLoader, decisionTree };
}
