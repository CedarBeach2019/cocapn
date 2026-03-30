/**
 * RepoLearner — Analyzes git history to build repo self-understanding.
 * 
 * The agent doesn't just store facts about the repo — it understands WHY
 * the repo is structured this way. This module analyzes git commits,
 * detects patterns, tracks architectural decisions, and maps module boundaries.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CommitAnalysis {
  sha: string;
  message: string;
  body: string;
  timestamp: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  category: 'feature' | 'fix' | 'refactor' | 'chore' | 'docs' | 'test' | 'breaking';
  scope: string;
  architectural: boolean;
  rationale: string;
}

export interface ArchitecturalDecision {
  id: string;
  title: string;
  decision: string;
  rationale: string;
  alternativesConsidered: string[];
  commitSha: string;
  date: string;
  reversible: boolean;
  impact: 'low' | 'medium' | 'high' | 'critical';
  modules: string[];
  source: 'manual' | 'git';
}

export interface FileContext {
  totalCommits: number;
  lastModified: string;
  primaryAuthors: string[];
  changeFrequency: 'low' | 'medium' | 'high';
  recentChanges: Array<{ sha: string; date: string; message: string; linesChanged: number; category: string }>;
  hotspots: string[];
  contextNotes: string;
  source: string;
}

export interface CodePattern {
  id: string;
  name: string;
  description: string;
  evidence: string[];
  frequency: string;
  reliability: number;
  learned: string;
  source: string;
}

export interface ModuleInfo {
  path: string;
  responsibility: string;
  boundary: string;
  importsFrom: string[];
  importedBy: string[];
  changeCoupling: Record<string, number>;
  reason: string;
  source: string;
}

export interface RepoUnderstanding {
  architecture: ArchitecturalDecision[];
  fileHistory: Record<string, FileContext>;
  patterns: CodePattern[];
  moduleMap: Record<string, ModuleInfo>;
  lastBuilt: string;
  commitsAnalyzed: number;
}

// ── RepoLearner ────────────────────────────────────────────────────────────

export class RepoLearner {
  private repoRoot: string;
  private understandingPath: string;
  private cache: RepoUnderstanding | null = null;

  constructor(repoRoot: string, brainPath: string) {
    this.repoRoot = repoRoot;
    this.understandingPath = join(brainPath, 'repo-understanding');
  }

  // ── Public API ─────────────────────────────────────────────────────────

  async buildIndex(commitsToAnalyze = 200): Promise<RepoUnderstanding> {
    if (!this.isGitRepo()) {
      return this.emptyUnderstanding();
    }

    const commits = this.analyzeCommits(commitsToAnalyze);
    const fileHistory = this.buildFileHistory(commits);
    const patterns = this.detectPatterns(commits);
    const moduleMap = this.inferModuleBoundaries(commits);
    const architecture = this.extractArchitectureDecisions(commits);

    const understanding: RepoUnderstanding = {
      architecture,
      fileHistory,
      patterns,
      moduleMap,
      lastBuilt: new Date().toISOString(),
      commitsAnalyzed: commits.length,
    };

    this.cache = understanding;
    this.persist(understanding);
    return understanding;
  }

  async onCommit(sha?: string): Promise<void> {
    if (!this.isGitRepo()) return;

    // Load existing cache
    const existing = this.loadCache();

    // Analyze just the latest commit (or specified sha)
    const target = sha || this.getHeadSha();
    if (!target) return;

    const commit = this.analyzeSingleCommit(target);
    if (!commit) return;

    // Update file history for changed files
    for (const file of commit.filesChanged) {
      if (!existing.fileHistory[file]) {
        existing.fileHistory[file] = {
          totalCommits: 0,
          lastModified: '',
          primaryAuthors: [],
          changeFrequency: 'low',
          recentChanges: [],
          hotspots: [],
          contextNotes: '',
          source: 'git',
        };
      }
      existing.fileHistory[file].totalCommits++;
      existing.fileHistory[file].lastModified = commit.timestamp;
      existing.fileHistory[file].recentChanges.unshift({
        sha: commit.sha,
        date: commit.timestamp,
        message: commit.message,
        linesChanged: commit.linesAdded + commit.linesRemoved,
        category: commit.category,
      });
      // Keep only last 10 recent changes
      existing.fileHistory[file].recentChanges = existing.fileHistory[file].recentChanges.slice(0, 10);
      // Update frequency
      existing.fileHistory[file].changeFrequency = this.calcFrequency(existing.fileHistory[file].totalCommits);
    }

    // Check if architectural
    if (commit.architectural) {
      existing.architecture.push({
        id: `dec_${String(existing.architecture.length + 1).padStart(3, '0')}`,
        title: commit.message,
        decision: commit.message,
        rationale: commit.rationale || commit.body,
        alternativesConsidered: [],
        commitSha: commit.sha,
        date: commit.timestamp,
        reversible: false,
        impact: commit.filesChanged.length > 5 ? 'high' : 'medium',
        modules: commit.filesChanged.map(f => this.extractModule(f)),
        source: 'git',
      });
    }

    existing.lastBuilt = new Date().toISOString();
    existing.commitsAnalyzed++;
    this.cache = existing;
    this.persist(existing);
  }

  async queryFile(filePath: string): Promise<FileContext | null> {
    const cache = await this.getUnderstanding();
    return cache.fileHistory[filePath] || null;
  }

  async queryModule(moduleName: string): Promise<ModuleInfo | null> {
    const cache = await this.getUnderstanding();
    return cache.moduleMap[moduleName] || null;
  }

  async queryArchitecture(): Promise<ArchitecturalDecision[]> {
    const cache = await this.getUnderstanding();
    return cache.architecture;
  }

  async queryPatterns(): Promise<CodePattern[]> {
    const cache = await this.getUnderstanding();
    return cache.patterns;
  }

  // ── Git Commands ──────────────────────────────────────────────────────

  private runGit(args: string[]): string {
    try {
      return execSync(`git ${args.join(' ')}`, {
        cwd: this.repoRoot,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      return '';
    }
  }

  private isGitRepo(): boolean {
    return existsSync(join(this.repoRoot, '.git'));
  }

  private getHeadSha(): string | null {
    const sha = this.runGit(['rev-parse', 'HEAD']);
    return sha || null;
  }

  // ── Commit Analysis ──────────────────────────────────────────────────

  private analyzeCommits(count: number): CommitAnalysis[] {
    const log = this.runGit([
      'log',
      `-${count}`,
      '--format=%H%n%s%n%b%n%ai',
      '--numstat',
    ]);

    if (!log) return [];

    return this.parseLogOutput(log);
  }

  private analyzeSingleCommit(sha: string): CommitAnalysis | null {
    const log = this.runGit([
      'log', '-1', `--format=%H%n%s%n%b%n%ai`, '--numstat', sha,
    ]);

    if (!log) return null;

    const commits = this.parseLogOutput(log);
    return commits[0] || null;
  }

  private parseLogOutput(log: string): CommitAnalysis[] {
    const commits: CommitAnalysis[] = [];
    const blocks = log.split(/\n(?=[a-f0-9]{40}\n)/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (lines.length < 4) continue;

      const sha = lines[0].trim();
      const message = lines[1].trim();
      const timestamp = lines[3]?.trim() || '';
      const body = lines[4]?.trim() || '';

      // Parse numstat (rest of lines)
      let linesAdded = 0;
      let linesRemoved = 0;
      const filesChanged: string[] = [];

      for (let i = 5; i < lines.length; i++) {
        const line = lines[i].trim();
        const numstatMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        if (numstatMatch) {
          const added = numstatMatch[1] === '-' ? 0 : parseInt(numstatMatch[1], 10);
          const removed = numstatMatch[2] === '-' ? 0 : parseInt(numstatMatch[2], 10);
          linesAdded += added;
          linesRemoved += removed;
          filesChanged.push(numstatMatch[3]);
        }
      }

      const category = this.categorizeCommit(message);
      const scope = this.extractScope(message);
      const architectural = this.isArchitectural(filesChanged, linesAdded + linesRemoved);
      const rationale = this.extractRationale(message, body);

      commits.push({
        sha,
        message,
        body,
        timestamp,
        filesChanged,
        linesAdded,
        linesRemoved,
        category,
        scope,
        architectural,
        rationale,
      });
    }

    return commits;
  }

  private categorizeCommit(message: string): CommitAnalysis['category'] {
    const lower = message.toLowerCase();
    if (lower.startsWith('feat!') || lower.startsWith('breaking')) return 'breaking';
    if (lower.startsWith('feat') || lower.startsWith('add')) return 'feature';
    if (lower.startsWith('fix') || lower.startsWith('bug')) return 'fix';
    if (lower.startsWith('refactor') || lower.startsWith('rewrite')) return 'refactor';
    if (lower.startsWith('docs') || lower.startsWith('readme')) return 'docs';
    if (lower.startsWith('test') || lower.startsWith('spec')) return 'test';
    return 'chore';
  }

  private extractScope(message: string): string {
    const match = message.match(/^(?:feat|fix|refactor|docs|test|chore|breaking)[(!:]\s*(\w+)/i);
    return match ? match[1].toLowerCase() : '';
  }

  private isArchitectural(filesChanged: string[], totalLines: number): boolean {
    // Crosses more than 3 different directories = likely architectural
    const dirs = new Set(filesChanged.map(f => f.split('/').slice(0, 2).join('/')));
    return dirs.size > 3 || totalLines > 500;
  }

  private extractRationale(message: string, body: string): string {
    // Look for rationale patterns in commit body
    const patterns = [
      /because[:\s]+(.+)/i,
      /reason[:\s]+(.+)/i,
      /why[:\s]+(.+)/i,
      /rationale[:\s]+(.+)/i,
      /fixes?\s+(#\d+|[a-z]+-\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern) || message.match(pattern);
      if (match) return match[1].trim();
    }

    // Use commit message body as fallback rationale
    return body.split('\n')[0]?.trim() || '';
  }

  // ── File History ─────────────────────────────────────────────────────

  private buildFileHistory(commits: CommitAnalysis[]): Record<string, FileContext> {
    const history: Record<string, FileContext> = {};

    for (const commit of commits) {
      for (const file of commit.filesChanged) {
        if (!history[file]) {
          history[file] = {
            totalCommits: 0,
            lastModified: '',
            primaryAuthors: [],
            changeFrequency: 'low',
            recentChanges: [],
            hotspots: [],
            contextNotes: '',
            source: 'git',
          };
        }

        history[file].totalCommits++;
        history[file].lastModified = commit.timestamp;

        // Keep last 10 changes
        history[file].recentChanges.push({
          sha: commit.sha,
          date: commit.timestamp,
          message: commit.message,
          linesChanged: commit.linesAdded + commit.linesRemoved,
          category: commit.category,
        });
        if (history[file].recentChanges.length > 10) {
          history[file].recentChanges = history[file].recentChanges.slice(0, 10);
        }
      }
    }

    // Calculate frequencies and generate notes
    for (const [file, ctx] of Object.entries(history)) {
      ctx.changeFrequency = this.calcFrequency(ctx.totalCommits);
      ctx.contextNotes = this.generateContextNotes(file, ctx);
    }

    return history;
  }

  private calcFrequency(totalCommits: number): 'low' | 'medium' | 'high' {
    if (totalCommits >= 20) return 'high';
    if (totalCommits >= 8) return 'medium';
    return 'low';
  }

  private generateContextNotes(file: string, ctx: FileContext): string {
    const parts: string[] = [];
    if (ctx.changeFrequency === 'high') {
      parts.push('Frequently modified — check recent changes before editing.');
    }
    if (ctx.recentChanges.length > 0) {
      const lastCat = ctx.recentChanges[0].category;
      if (lastCat === 'refactor') {
        parts.push('Recently refactored — may have structural changes.');
      }
    }
    const module = this.extractModule(file);
    if (module) {
      parts.push(`Part of module: ${module}`);
    }
    return parts.join(' ');
  }

  private extractModule(filePath: string): string {
    const parts = filePath.split('/');
    // For packages/x/src/y, module is y
    if (parts.length >= 3 && parts[0] === 'packages') {
      return parts[2] || parts[1];
    }
    // For src/x, module is x
    if (parts[0] === 'src' && parts.length >= 2) {
      return parts[1];
    }
    return parts[0] || 'root';
  }

  // ── Pattern Detection ────────────────────────────────────────────────

  private detectPatterns(commits: CommitAnalysis[]): CodePattern[] {
    const patterns: CodePattern[] = [];

    // Group commits by scope
    const scopeCommits: Record<string, CommitAnalysis[]> = {};
    for (const commit of commits) {
      const scope = commit.scope || 'general';
      if (!scopeCommits[scope]) scopeCommits[scope] = [];
      scopeCommits[scope].push(commit);
    }

    // Detect frequent patterns (3+ commits to same scope)
    let patternId = 1;
    for (const [scope, scopeCommitList] of Object.entries(scopeCommits)) {
      if (scopeCommitList.length >= 3) {
        const files = new Set(scopeCommitList.flatMap(c => c.filesChanged));
        patterns.push({
          id: `pat_${String(patternId++).padStart(3, '0')}`,
          name: `Frequent changes to ${scope}`,
          description: `${scopeCommitList.length} commits touching ${files.size} files in the ${scope} scope`,
          evidence: Array.from(files).slice(0, 5),
          frequency: `${scopeCommitList.length} commits`,
          reliability: Math.min(1, scopeCommitList.length / 10),
          learned: scopeCommitList[0].timestamp,
          source: 'git',
        });
      }
    }

    // Detect file coupling (files that change together)
    const filePairs: Record<string, number> = {};
    for (const commit of commits) {
      const files = commit.filesChanged;
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const key = [files[i], files[j]].sort().join(' ↔ ');
          filePairs[key] = (filePairs[key] || 0) + 1;
        }
      }
    }

    for (const [pair, count] of Object.entries(filePairs)) {
      if (count >= 3) {
        patterns.push({
          id: `pat_${String(patternId++).padStart(3, '0')}`,
          name: `File coupling: ${pair}`,
          description: `These files change together ${count} times`,
          evidence: pair.split(' ↔ '),
          frequency: `${count} commits`,
          reliability: Math.min(1, count / 10),
          learned: commits[0].timestamp,
          source: 'git',
        });
      }
    }

    return patterns;
  }

  // ── Module Boundaries ────────────────────────────────────────────────

  private inferModuleBoundaries(commits: CommitAnalysis[]): Record<string, ModuleInfo> {
    const modules: Record<string, ModuleInfo> = {};

    // Get directory structure
    const dirs = this.getSourceDirs();
    for (const dir of dirs) {
      const moduleName = dir.split('/').pop() || dir;
      const filesInModule = commits.flatMap(c =>
        c.filesChanged.filter(f => f.startsWith(dir))
      );

      if (filesInModule.length === 0) continue;

      const importedBy = this.findImporters(dir);
      const importsFrom = this.findImports(dir);

      modules[moduleName] = {
        path: dir,
        responsibility: this.inferResponsibility(moduleName, filesInModule),
        boundary: `Module ${dir}/ — changes should be contained within this directory`,
        importsFrom,
        importedBy,
        changeCoupling: this.calcChangeCoupling(dir, commits),
        reason: `Detected from ${filesInModule.length} file touches across commit history`,
        source: 'git',
      };
    }

    return modules;
  }

  private getSourceDirs(): string[] {
    const output = this.runGit(['ls-tree', '-d', '--name-only', 'HEAD', 'src/', 'packages/']);
    if (!output) return ['src'];
    return output.split('\n').filter(Boolean).slice(0, 20);
  }

  private inferResponsibility(moduleName: string, files: string[]): string {
    const exts = new Set(files.map(f => {
      const parts = f.split('.');
      return parts.length > 1 ? parts[parts.length - 1] : '';
    }));

    const parts: string[] = [];
    if (moduleName.includes('brain') || moduleName.includes('memory')) parts.push('Memory layer');
    if (moduleName.includes('ws') || moduleName.includes('server')) parts.push('WebSocket server');
    if (moduleName.includes('llm') || moduleName.includes('provider')) parts.push('LLM integration');
    if (moduleName.includes('plugin') || moduleName.includes('module')) parts.push('Plugin/module system');
    if (moduleName.includes('security') || moduleName.includes('auth')) parts.push('Security');
    if (moduleName.includes('git') || moduleName.includes('sync')) parts.push('Git operations');
    if (moduleName.includes('handler') || moduleName.includes('route')) parts.push('Request handling');
    if (moduleName.includes('config') || moduleName.includes('setting')) parts.push('Configuration');
    if (moduleName.includes('test') || moduleName.includes('spec')) parts.push('Testing');
    if (moduleName.includes('cloud') || moduleName.includes('worker')) parts.push('Cloud deployment');
    if (moduleName.includes('fleet') || moduleName.includes('a2a')) parts.push('Fleet coordination');
    if (moduleName.includes('skill') || moduleName.includes('tool')) parts.push('Skills and tools');

    if (parts.length > 0) return parts.join(', ');
    if (exts.has('ts') || exts.has('js')) return 'TypeScript module';
    return 'Unknown module';
  }

  private findImporters(dir: string): string[] {
    const output = this.runGit(['grep', '-l', `from ['"].*${dir}`, '--include=*.ts', 'HEAD']);
    if (!output) return [];
    return output.split('\n').slice(0, 5).map(f => this.extractModule(f));
  }

  private findImports(dir: string): string[] {
    // Read a representative file to find imports
    const files = this.runGit(['ls-tree', '--name-only', 'HEAD', dir]);
    if (!files) return [];
    const firstFile = files.split('\n')[0];
    if (!firstFile) return [];

    const content = this.runGit(['show', `HEAD:${firstFile}`]);
    if (!content) return [];

    const imports: string[] = [];
    const importRegex = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const mod = this.extractModule(match[1]);
      if (mod && !imports.includes(mod)) imports.push(mod);
    }
    return imports.slice(0, 5);
  }

  private calcChangeCoupling(dir: string, commits: CommitAnalysis[]): Record<string, number> {
    const coupling: Record<string, number> = {};
    for (const commit of commits) {
      const modules = new Set(commit.filesChanged.map(f => this.extractModule(f)));
      if (modules.has(dir.split('/').pop() || dir)) {
        for (const mod of modules) {
          if (mod !== (dir.split('/').pop() || dir)) {
            coupling[mod] = (coupling[mod] || 0) + 1;
          }
        }
      }
    }
    // Keep top 5
    const sorted = Object.entries(coupling).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return Object.fromEntries(sorted);
  }

  // ── Architecture Decisions ───────────────────────────────────────────

  private extractArchitectureDecisions(commits: CommitAnalysis[]): ArchitecturalDecision[] {
    const decisions: ArchitecturalDecision[] = [];
    let id = 1;

    for (const commit of commits) {
      if (!commit.architectural) continue;

      decisions.push({
        id: `dec_${String(id++).padStart(3, '0')}`,
        title: commit.message,
        decision: commit.message,
        rationale: commit.rationale || commit.body || 'See commit message',
        alternativesConsidered: [],
        commitSha: commit.sha,
        date: commit.timestamp,
        reversible: commit.category === 'refactor',
        impact: commit.filesChanged.length > 10 ? 'critical' : commit.filesChanged.length > 5 ? 'high' : 'medium',
        modules: [...new Set(commit.filesChanged.map(f => this.extractModule(f)))],
        source: 'git',
      });
    }

    return decisions;
  }

  // ── Cache ────────────────────────────────────────────────────────────

  private async getUnderstanding(): Promise<RepoUnderstanding> {
    if (this.cache) return this.cache;
    this.cache = this.loadCache();
    return this.cache || this.emptyUnderstanding();
  }

  private loadCache(): RepoUnderstanding {
    try {
      const archPath = join(this.understandingPath, 'architecture.json');
      const histPath = join(this.understandingPath, 'file-history.json');
      const patPath = join(this.understandingPath, 'patterns.json');
      const modPath = join(this.understandingPath, 'module-map.json');

      if (!existsSync(archPath)) return this.emptyUnderstanding();

      return {
        architecture: JSON.parse(readFileSync(archPath, 'utf-8')),
        fileHistory: existsSync(histPath) ? JSON.parse(readFileSync(histPath, 'utf-8')) : {},
        patterns: existsSync(patPath) ? JSON.parse(readFileSync(patPath, 'utf-8')) : [],
        moduleMap: existsSync(modPath) ? JSON.parse(readFileSync(modPath, 'utf-8')) : {},
        lastBuilt: existsSync(archPath) ? this.getModTime(archPath) : '',
        commitsAnalyzed: 0,
      };
    } catch {
      return this.emptyUnderstanding();
    }
  }

  private persist(understanding: RepoUnderstanding): void {
    try {
      mkdirSync(this.understandingPath, { recursive: true });

      writeFileSync(
        join(this.understandingPath, 'architecture.json'),
        JSON.stringify(understanding.architecture, null, 2),
      );
      writeFileSync(
        join(this.understandingPath, 'file-history.json'),
        JSON.stringify(understanding.fileHistory, null, 2),
      );
      writeFileSync(
        join(this.understandingPath, 'patterns.json'),
        JSON.stringify(understanding.patterns, null, 2),
      );
      writeFileSync(
        join(this.understandingPath, 'module-map.json'),
        JSON.stringify(understanding.moduleMap, null, 2),
      );
    } catch {
      // Silent fail — repo-understanding is best-effort
    }
  }

  private getModTime(filePath: string): string {
    try {
      return statSync(filePath).mtime.toISOString();
    } catch {
      return '';
    }
  }

  private emptyUnderstanding(): RepoUnderstanding {
    return {
      architecture: [],
      fileHistory: {},
      patterns: [],
      moduleMap: {},
      lastBuilt: '',
      commitsAnalyzed: 0,
    };
  }
}
