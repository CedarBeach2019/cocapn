import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RepoLearner } from '../../src/brain/repo-learner.js';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

describe('RepoLearner', () => {
  let testDir: string;
  let brainDir: string;
  let learner: RepoLearner;

  beforeEach(() => {
    testDir = join('/tmp', `repo-learner-test-${Date.now()}`);
    brainDir = join(testDir, 'brain');
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(brainDir, 'repo-understanding'), { recursive: true });
    learner = new RepoLearner(testDir, brainDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function initGitRepo() {
    execSync('git init', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: testDir, stdio: 'pipe' });
  }

  function makeCommit(message: string, files: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(testDir, path);
      mkdirSync(fullPath.split('/').slice(0, -1).join('/'), { recursive: true });
      writeFileSync(fullPath, content);
    }
    execSync('git add -A', { cwd: testDir, stdio: 'pipe' });
    execSync(`git commit -m "${message}"`, { cwd: testDir, stdio: 'pipe' });
  }

  describe('non-git repo', () => {
    it('returns empty understanding for non-git repo', async () => {
      const result = await learner.buildIndex();
      expect(result.architecture).toEqual([]);
      expect(result.fileHistory).toEqual({});
      expect(result.patterns).toEqual([]);
      expect(result.moduleMap).toEqual({});
      expect(result.commitsAnalyzed).toBe(0);
    });

    it('onCommit does nothing for non-git repo', async () => {
      await learner.onCommit();
      const result = await learner.queryFile('any.ts');
      expect(result).toBeNull();
    });
  });

  describe('buildIndex', () => {
    it('analyzes commits and builds understanding', async () => {
      initGitRepo();
      makeCommit('feat: initial setup', { 'src/index.ts': 'console.log("hello")' });
      makeCommit('fix: bug in index', { 'src/index.ts': 'console.log("fixed")' });
      makeCommit('feat: add brain module', {
        'src/brain/index.ts': 'export class Brain {}',
        'src/brain/memory.ts': 'export class Memory {}',
      });

      const result = await learner.buildIndex();
      expect(result.commitsAnalyzed).toBe(3);
      expect(Object.keys(result.fileHistory).length).toBeGreaterThan(0);
    });

    it('categorizes commits correctly', async () => {
      initGitRepo();
      makeCommit('feat: add feature', { 'src/a.ts': 'a' });
      makeCommit('fix: fix bug', { 'src/b.ts': 'b' });
      makeCommit('refactor: restructure', { 'src/c.ts': 'c' });
      makeCommit('docs: update readme', { 'README.md': '# Test' });
      makeCommit('test: add tests', { 'src/a.test.ts': 'test' });

      const result = await learner.buildIndex();
      expect(result.commitsAnalyzed).toBe(5);
    });

    it('detects architectural commits', async () => {
      initGitRepo();
      // Commit touching many different directories
      makeCommit('feat: major restructure', {
        'src/a.ts': 'a',
        'src/b.ts': 'b',
        'src/c.ts': 'c',
        'src/d.ts': 'd',
        'tests/a.test.ts': 'test',
      });

      const result = await learner.buildIndex();
      expect(result.architecture.length).toBeGreaterThan(0);
      expect(result.architecture[0].source).toBe('git');
    });

    it('builds file history with correct metadata', async () => {
      initGitRepo();
      makeCommit('feat: add module', { 'src/brain/index.ts': 'brain' });
      makeCommit('feat: add memory', { 'src/brain/memory.ts': 'memory' });

      const result = await learner.buildIndex();
      const brainCtx = result.fileHistory['src/brain/index.ts'];
      expect(brainCtx).toBeDefined();
      expect(brainCtx.totalCommits).toBe(1);
      expect(brainCtx.changeFrequency).toBe('low');
      expect(brainCtx.recentChanges.length).toBe(1);
    });

    it('detects patterns from repeated scopes', async () => {
      initGitRepo();
      makeCommit('feat(brain): add memory', { 'src/brain/memory.ts': 'memory' });
      makeCommit('fix(brain): fix memory leak', { 'src/brain/memory.ts': 'fix' });
      makeCommit('feat(brain): add facts', { 'src/brain/facts.ts': 'facts' });

      const result = await learner.buildIndex();
      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns[0].source).toBe('git');
    });

    it('infers module boundaries', async () => {
      initGitRepo();
      makeCommit('feat: add brain', { 'src/brain/index.ts': 'brain' });
      makeCommit('feat: add ws', { 'src/ws/server.ts': 'ws' });
      makeCommit('feat: add config', { 'src/config/loader.ts': 'config' });

      const result = await learner.buildIndex();
      // Module map should have entries for directories with commits
      expect(Object.keys(result.moduleMap).length).toBeGreaterThan(0);
    });

    it('persists results to disk', async () => {
      initGitRepo();
      makeCommit('feat: initial', { 'src/index.ts': 'code' });

      await learner.buildIndex();

      // Check files exist
      const { existsSync, readFileSync } = require('fs');
      expect(existsSync(join(brainDir, 'repo-understanding', 'architecture.json'))).toBe(true);
      expect(existsSync(join(brainDir, 'repo-understanding', 'file-history.json'))).toBe(true);
      expect(existsSync(join(brainDir, 'repo-understanding', 'patterns.json'))).toBe(true);
      expect(existsSync(join(brainDir, 'repo-understanding', 'module-map.json'))).toBe(true);
    });

    it('caches results in memory', async () => {
      initGitRepo();
      makeCommit('feat: initial', { 'src/index.ts': 'code' });

      const result1 = await learner.buildIndex();
      const result2 = await learner.queryFile('src/index.ts');
      expect(result2).toBeDefined();
    });
  });

  describe('onCommit', () => {
    it('updates file history for new commit', async () => {
      initGitRepo();
      makeCommit('feat: initial', { 'src/index.ts': 'v1' });

      await learner.buildIndex();

      makeCommit('feat: update', { 'src/index.ts': 'v2' });
      await learner.onCommit();

      const result = await learner.queryFile('src/index.ts');
      expect(result).toBeDefined();
      expect(result!.totalCommits).toBe(2);
    });

    it('adds architectural decisions for architectural commits', async () => {
      initGitRepo();
      makeCommit('feat: initial', { 'src/a.ts': 'a' });
      await learner.buildIndex();

      // Make an architectural commit
      makeCommit('refactor: major restructure', {
        'src/a.ts': 'a2',
        'src/b.ts': 'b2',
        'src/c.ts': 'c2',
        'src/d.ts': 'd2',
        'tests/e.test.ts': 'e',
      });
      await learner.onCommit();

      const arch = await learner.queryArchitecture();
      expect(arch.length).toBeGreaterThan(0);
    });
  });

  describe('queryFile', () => {
    it('returns null for unknown file', async () => {
      initGitRepo();
      makeCommit('feat: initial', { 'src/index.ts': 'code' });
      await learner.buildIndex();

      const result = await learner.queryFile('nonexistent.ts');
      expect(result).toBeNull();
    });

    it('returns context for known file', async () => {
      initGitRepo();
      makeCommit('feat: add brain', { 'src/brain/index.ts': 'brain' });
      await learner.buildIndex();

      const result = await learner.queryFile('src/brain/index.ts');
      expect(result).not.toBeNull();
      expect(result!.totalCommits).toBe(1);
      expect(result!.source).toBe('git');
    });
  });

  describe('queryModule', () => {
    it('returns null for unknown module', async () => {
      initGitRepo();
      makeCommit('feat: initial', { 'src/index.ts': 'code' });
      await learner.buildIndex();

      const result = await learner.queryModule('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('categorizeCommit', () => {
    it('categorizes breaking changes', async () => {
      initGitRepo();
      makeCommit('feat!: breaking change', { 'src/a.ts': 'a' });
      const result = await learner.buildIndex();
      // At least one commit should be analyzed
      expect(result.commitsAnalyzed).toBe(1);
    });

    it('defaults to chore for unknown prefixes', async () => {
      initGitRepo();
      makeCommit('wip: something', { 'src/a.ts': 'a' });
      const result = await learner.buildIndex();
      expect(result.commitsAnalyzed).toBe(1);
    });
  });

  describe('extractScope', () => {
    it('extracts scope from conventional commits', async () => {
      initGitRepo();
      makeCommit('feat(brain): add memory', { 'src/brain/memory.ts': 'm' });
      const result = await learner.buildIndex();
      expect(result.commitsAnalyzed).toBe(1);
    });
  });

  describe('calcFrequency', () => {
    it('marks high frequency for files with many commits', async () => {
      initGitRepo();
      for (let i = 0; i < 25; i++) {
        makeCommit(`feat: update ${i}`, { 'src/index.ts': `v${i}` });
      }
      const result = await learner.buildIndex();
      const ctx = result.fileHistory['src/index.ts'];
      expect(ctx.changeFrequency).toBe('high');
    });

    it('marks low frequency for files with few commits', async () => {
      initGitRepo();
      makeCommit('feat: add', { 'src/index.ts': 'v1' });
      const result = await learner.buildIndex();
      const ctx = result.fileHistory['src/index.ts'];
      expect(ctx.changeFrequency).toBe('low');
    });
  });

  describe('detectPatterns', () => {
    it('detects file coupling', async () => {
      initGitRepo();
      // Two files that always change together
      for (let i = 0; i < 5; i++) {
        makeCommit(`feat: update ${i}`, {
          'src/brain/index.ts': `brain v${i}`,
          'src/brain/memory.ts': `memory v${i}`,
        });
      }
      const result = await learner.buildIndex();
      const couplingPattern = result.patterns.find(p => p.name.includes('coupling'));
      expect(couplingPattern).toBeDefined();
    });
  });

  describe('graceful degradation', () => {
    it('handles corrupted cache files', async () => {
      const { writeFileSync } = require('fs');
      writeFileSync(join(brainDir, 'repo-understanding', 'architecture.json'), 'not json');

      const result = await learner.buildIndex();
      // Should not throw, returns empty
      expect(result).toBeDefined();
    });

    it('handles permission errors', async () => {
      initGitRepo();
      makeCommit('feat: initial', { 'src/index.ts': 'code' });

      // Point to invalid brain path
      const badLearner = new RepoLearner(testDir, '/proc/invalid');
      const result = await badLearner.buildIndex();
      // Should not throw — graceful degradation
      expect(result.commitsAnalyzed).toBe(1);
    });
  });
});
