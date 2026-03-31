/* eslint-disable */
// @ts-nocheck
/**
 * Live DeepSeek API Test — tests real LLM responses with persistent memory.
 *
 * Skipped unless DEEPSEEK_API_KEY is set in the environment.
 *
 * Flow:
 *   1. Create temp repo
 *   2. Send "My name is Casey" → verify response mentions Casey
 *   3. Extract + persist facts
 *   4. New session → send "What is my name?"
 *   5. Verify LLM remembers Casey (from persisted facts in system prompt)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

import { LLM } from '../src/llm.ts';
import { Memory } from '../src/memory.ts';
import { Awareness } from '../src/awareness.ts';
import { loadSoul, soulToSystemPrompt } from '../src/soul.ts';
import { extract } from '../src/extract.ts';

const uid = () => Math.random().toString(36).slice(2);
const apiKey = process.env.DEEPSEEK_API_KEY;

// Skip entire suite if no API key
const describeLive = apiKey ? describe : describe.skip;

describeLive('Live DeepSeek API', () => {
  let testDir: string;
  let llm: InstanceType<typeof LLM>;
  let soul: { name: string; tone: string; model: string; body: string };

  beforeAll(() => {
    testDir = join(tmpdir(), `cocapn-live-${uid()}-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    writeFileSync(join(testDir, 'soul.md'),
      '---\nname: LiveBot\ntone: friendly\n---\n\nI am LiveBot. I remember what people tell me.');
    writeFileSync(join(testDir, 'package.json'),
      JSON.stringify({ name: 'live-test-repo' }));

    execSync('git init', { cwd: testDir });
    execSync('git config user.email test@test.com', { cwd: testDir });
    execSync('git config user.name TestUser', { cwd: testDir });
    execSync('git add .', { cwd: testDir });
    execSync('git commit -m "init"', { cwd: testDir });

    soul = loadSoul(join(testDir, 'soul.md'));
    llm = new LLM({ provider: 'deepseek', apiKey });
  });

  afterAll(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  /** Send a chat message with full context and return the response text */
  async function sendChat(userText: string, mem: Memory): Promise<string> {
    const awareness = new Awareness(testDir);
    const fullSystem = [
      soulToSystemPrompt(soul), '',
      '## Who I Am', awareness.narrate(), '',
      mem.formatFacts() ? `## What I Remember\n${mem.formatFacts()}` : '', '',
      '## Recent Conversation', mem.formatContext(10) || '(start of conversation)',
    ].join('\n');

    let response = '';
    for await (const chunk of llm.chatStream([
      { role: 'system', content: fullSystem },
      { role: 'user', content: userText },
    ])) {
      if (chunk.type === 'content' && chunk.text) response += chunk.text;
      if (chunk.type === 'error') throw new Error(chunk.error);
    }

    mem.addMessage('user', userText);
    if (response) mem.addMessage('assistant', response);
    extract(userText, mem);

    return response;
  }

  // ── Session 1 ─────────────────────────────────────────────────────────────────

  it('session 1: tells the bot their name', async () => {
    const mem = new Memory(testDir);
    const response = await sendChat('My name is Casey', mem);

    expect(response).toBeTruthy();
    expect(response.toLowerCase()).toContain('casey');

    // Verify fact was extracted
    expect(mem.facts['user.name']).toBe('Casey');
  }, 30000);

  // ── Session 2: new memory instance (simulates restart) ─────────────────────────

  it('session 2: bot remembers the name from persisted facts', async () => {
    // New memory instance loads from disk — simulates a fresh session
    const mem = new Memory(testDir);

    // Verify facts persisted
    expect(mem.facts['user.name']).toBe('Casey');

    const response = await sendChat('What is my name?', mem);

    expect(response).toBeTruthy();
    expect(response.toLowerCase()).toContain('casey');
  }, 30000);
});
