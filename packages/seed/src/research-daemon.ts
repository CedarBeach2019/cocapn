/**
 * Research Daemon — background auto-research system for cocapn.
 *
 * Uses Google Gemini for deep analysis and quick summaries.
 * Saves findings to memory/knowledge/. Zero deps beyond google.ts.
 */

import { Google, GOOGLE_MODELS } from './google.js';
import type { ChatResult } from './google.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ResearchStatus = 'queued' | 'running' | 'done' | 'error';

export interface ResearchJob {
  id: string;
  topic: string;
  status: ResearchStatus;
  progress: number;
  findings: any[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
}

export interface ResearchConfig {
  maxConcurrent?: number;
  onFinding?: (topicId: string, finding: any) => void;
  onComplete?: (topicId: string, findings: any[]) => void;
  apiKey?: string;
  outputDir?: string;
}

export interface ScheduleConfig {
  enabled: boolean;
  cron: string;
  maxTopics: number;
  sources?: string[];
}

// ─── Daemon ────────────────────────────────────────────────────────────────────

const jobs = new Map<string, ResearchJob>();
let jobCounter = 0;

/** Injectable Google instance — override for testing */
let _google: Google | null = null;

/** Set a custom Google instance (for testing) */
export function setGoogleInstance(g: Google | null): void {
  _google = g;
}

export function startResearch(topic: string, config?: ResearchConfig): ResearchJob {
  const id = `research-${++jobCounter}-${Date.now()}`;
  const job: ResearchJob = { id, topic, status: 'queued', progress: 0, findings: [], startedAt: new Date().toISOString() };
  jobs.set(id, job);

  const google = _google ?? new Google({ apiKey: config?.apiKey });

  // Run asynchronously
  (async () => {
    job.status = 'running';
    job.progress = 0.1;

    try {
      // Phase 1: Quick overview via Flash
      job.progress = 0.3;
      const overview: ChatResult = await google.chat(
        `Provide a concise overview of: ${topic}. Key concepts, current state, and practical uses.`,
        GOOGLE_MODELS.flash,
      );
      const gathered = { source: 'gemini-flash', model: overview.model, topic, relevance: 1.0, summary: overview.text };
      config?.onFinding?.(id, gathered);
      job.findings.push(gathered);

      // Phase 2: Deep analysis via Pro
      job.progress = 0.6;
      const analysisResult: ChatResult = await google.analyze(topic);
      const analysis = { source: 'gemini-pro', model: analysisResult.model, topic, insights: analysisResult.text, confidence: 0.9 };
      config?.onFinding?.(id, analysis);
      job.findings.push(analysis);

      // Phase 3: Synthesize summary via Flash
      job.progress = 0.9;
      const synthesisPrompt = `Synthesize the following research on "${topic}" into a clear, actionable summary with key findings and recommendations:\n\nOverview: ${overview.text.slice(0, 500)}\n\nDeep Analysis: ${analysisResult.text.slice(0, 1000)}`;
      const synthesisResult: ChatResult = await google.chat(synthesisPrompt, GOOGLE_MODELS.flash);
      const synthesis = { source: 'synthesis', topic, conclusion: synthesisResult.text, recommendations: [] };
      job.findings.push(synthesis);
      job.summary = synthesisResult.text;

      // Save to filesystem
      const outputDir = config?.outputDir ?? 'memory/knowledge';
      mkdirSync(outputDir, { recursive: true });
      const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const filePath = join(outputDir, `${slug}.md`);
      const md = [`# ${topic}`, '', `> Generated: ${new Date().toISOString()}`, '', '## Overview', '', overview.text, '', '## Deep Analysis', '', analysisResult.text, '', '## Summary', '', synthesisResult.text, ''].join('\n');
      writeFileSync(filePath, md, 'utf-8');

      job.status = 'done';
      job.progress = 1;
      job.completedAt = new Date().toISOString();
      config?.onComplete?.(id, job.findings);
    } catch (e) {
      job.status = 'error';
      job.error = String(e);
    }
  })();

  return job;
}

export function checkResearch(topicId: string): ResearchJob | undefined {
  return jobs.get(topicId);
}

export function listResearch(): ResearchJob[] {
  return [...jobs.values()];
}

export function notifyOnComplete(topicId: string, channel: string): void {
  const check = setInterval(() => {
    const job = jobs.get(topicId);
    if (!job || job.status === 'done' || job.status === 'error') {
      clearInterval(check);
      // Notification would be delivered via cocapn notify system
    }
  }, 1000);
}

export function autoResearchSchedule(config: ScheduleConfig): { active: boolean; nextRun: string } {
  if (!config.enabled) return { active: false, nextRun: '' };
  return {
    active: true,
    nextRun: `Scheduled: ${config.cron} (max ${config.maxTopics} topics)`,
  };
}

/** Clear all jobs (useful for testing) */
export function clearJobs(): void {
  jobs.clear();
  jobCounter = 0;
}
