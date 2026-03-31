/**
 * MCP — Model Context Protocol server for cocapn intelligence.
 *
 * Exposes intelligence tools via JSON-RPC over stdio.
 * Coding agents connect: cocapn --mcp
 * Zero external deps. JSON-RPC 2.0 over stdin/stdout.
 */

import { createInterface } from 'node:readline';
import { LLM } from './llm.js';
import * as intel from './intelligence.js';

const TOOLS = [
  { name: 'cocapn_explain', description: 'Deep code explanation with historical context', inputSchema: { type: 'object', properties: { path: { type: 'string' }, question: { type: 'string' } }, required: ['path'] } },
  { name: 'cocapn_context', description: 'What to know before editing a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'cocapn_impact', description: 'Impact analysis for a file change', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'cocapn_history', description: 'Decision history for a topic', inputSchema: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] } },
  { name: 'cocapn_suggest', description: 'What to work on next based on repo state', inputSchema: { type: 'object', properties: { context: { type: 'string' } } } },
];

export async function startMcpServer(dir: string, llm: LLM): Promise<void> {
  const rl = createInterface({ input: process.stdin });
  const send = (msg: object) => process.stdout.write(JSON.stringify(msg) + '\n');

  for await (const line of rl) {
    let msg: any;
    try { msg = JSON.parse(line); } catch { continue; }
    const { id, method, params } = msg;

    if (method === 'initialize') {
      send({ jsonrpc: '2.0', id, result: { capabilities: { tools: {} } } });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      try {
        const result = await handleTool(llm, dir, params?.name, params?.arguments ?? {});
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: result }] } });
      } catch (err: any) {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true } });
      }
    }
  }
}

async function handleTool(llm: LLM, dir: string, tool: string, args: Record<string, string>): Promise<string> {
  if (tool === 'cocapn_explain')
    return intel.explainCode(llm, dir, args.path, args.question ?? 'What does this do and why?');

  if (tool === 'cocapn_context') {
    const ctx = intel.getFileContext(dir, args.path);
    const parts = [`## Context for ${args.path}`];
    if (ctx.log.length) parts.push(`### History\n${ctx.log.map(l => `- ${l.hash} ${l.date}: ${l.msg}`).join('\n')}`);
    if (ctx.imports.length) parts.push(`### Imports\n${ctx.imports.join('\n')}`);
    if (ctx.importedBy.length) parts.push(`### Imported by\n${ctx.importedBy.join('\n')}`);
    parts.push(`### Content\n\`\`\`\n${ctx.content.slice(0, 2000)}\n\`\`\``);
    return parts.join('\n\n');
  }

  if (tool === 'cocapn_impact') {
    const imp = intel.assessImpact(dir, args.path);
    return `## Impact: ${args.path}\n\n**Risk: ${imp.risk}**\n- Dependents: ${imp.dependents.length}\n- Dependencies: ${imp.dependencies.length}\n- Changes (7d): ${imp.recentChanges}\n${imp.dependents.length ? `\nDependents:\n${imp.dependents.map(d => `- ${d}`).join('\n')}` : ''}`;
  }

  if (tool === 'cocapn_history') {
    const entries = intel.getHistory(dir, args.topic);
    return entries.length
      ? `## History: ${args.topic}\n\n${entries.map(e => `### ${e.hash} — ${e.msg}\n${e.date} by ${e.author}\nFiles: ${e.files.join(', ')}`).join('\n\n')}`
      : `No history found for "${args.topic}"`;
  }

  if (tool === 'cocapn_suggest')
    return intel.explainCode(llm, dir, '.', `Given the current repo state, what should be worked on next? Context: ${args.context ?? 'general'}`);

  throw new Error(`Unknown tool: ${tool}`);
}
