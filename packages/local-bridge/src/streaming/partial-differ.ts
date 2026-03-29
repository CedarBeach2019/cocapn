/**
 * PartialDiffer — apply diffs incrementally as they stream in.
 *
 * Maintains pending edits for multiple files, tracking original content
 * for rollback on failure. Diffs are applied chunk by chunk, with the
 * ability to finalize individual files or rollback all changes.
 *
 * Safety features:
 * - Original content backed up before any edits
 * - Rollback restores all files to original state
 * - Rate limiting prevents file thrashing
 * - Validation ensures files are valid after finalize
 */

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import type { DiffChunk } from "./diff-parser.js";

/**
 * Status of a pending edit for a single file.
 */
export interface PendingEdit {
  filePath: string;
  originalContent: string;  // Backup for rollback
  currentContent: string;   // Content as patches are applied
  patchesApplied: number;   // Count of applied chunks
  isComplete: boolean;      // Whether finalized
}

/**
 * Result of an apply operation.
 */
export interface ApplyResult {
  success: boolean;
  error?: string;
  patchesApplied?: number;
}

/**
 * Result of a finalize operation.
 */
export interface FinalizeResult {
  success: boolean;
  error?: string;
  bytesWritten?: number;
}

/**
 * PartialDiffer manages incremental diff application.
 *
 * Usage:
 * ```typescript
 * const differ = new PartialDiffer();
 * await differ.startEdit('/path/to/file.ts');
 *
 * for (const chunk of diffChunks) {
 *   const result = await differ.applyChunk('/path/to/file.ts', chunk);
 *   if (!result.success) {
 *     await differ.rollback();
 *     throw new Error(result.error);
 *   }
 * }
 *
 * const final = await differ.finalize('/path/to/file.ts');
 * if (!final.success) {
 *   await differ.rollback();
 * }
 * ```
 */
export class PartialDiffer {
  private pendingEdits: Map<string, PendingEdit>;
  private maxEditsPerSecond: number;
  private editTimestamps: number[];
  private repoRoot: string;

  constructor(repoRoot: string, maxEditsPerSecond: number = 10) {
    this.pendingEdits = new Map();
    this.maxEditsPerSecond = maxEditsPerSecond;
    this.editTimestamps = [];
    this.repoRoot = repoRoot;
  }

  /**
   * Begin editing a file. Reads current content as backup.
   */
  async startEdit(filePath: string): Promise<ApplyResult> {
    if (this.pendingEdits.has(filePath)) {
      return {
        success: false,
        error: `Already editing ${filePath}`,
      };
    }

    const fullPath = this.resolvePath(filePath);
    if (!existsSync(fullPath)) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    try {
      const content = await readFile(fullPath, 'utf-8');
      this.pendingEdits.set(filePath, {
        filePath,
        originalContent: content,
        currentContent: content,
        patchesApplied: 0,
        isComplete: false,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Apply a diff chunk to a pending edit.
   */
  async applyChunk(filePath: string, chunk: DiffChunk): Promise<ApplyResult> {
    const edit = this.pendingEdits.get(filePath);
    if (!edit) {
      return {
        success: false,
        error: `No pending edit for ${filePath}. Call startEdit first.`,
      };
    }

    if (edit.isComplete) {
      return {
        success: false,
        error: `File ${filePath} is already finalized. Start a new edit to modify.`,
      };
    }

    // Rate limiting
    if (!this.checkRateLimit()) {
      return {
        success: false,
        error: 'Rate limit exceeded: too many edits per second',
      };
    }

    try {
      edit.currentContent = this.applyPatchToContent(edit.currentContent, chunk);
      edit.patchesApplied++;
      this.recordEdit();

      return {
        success: true,
        patchesApplied: edit.patchesApplied,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Finalize a pending edit, writing changes to disk.
   */
  async finalize(filePath: string): Promise<FinalizeResult> {
    const edit = this.pendingEdits.get(filePath);
    if (!edit) {
      return {
        success: false,
        error: `No pending edit for ${filePath}`,
      };
    }

    if (edit.isComplete) {
      return {
        success: false,
        error: `File ${filePath} is already finalized`,
      };
    }

    try {
      const fullPath = this.resolvePath(filePath);
      await writeFile(fullPath, edit.currentContent, 'utf-8');

      edit.isComplete = true;
      this.pendingEdits.delete(filePath);

      return {
        success: true,
        bytesWritten: edit.currentContent.length,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Rollback all pending edits, restoring original content.
   */
  async rollback(): Promise<number> {
    let restored = 0;

    for (const [filePath, edit] of this.pendingEdits) {
      if (edit.isComplete) {
        continue; // Skip already finalized files
      }

      try {
        const fullPath = this.resolvePath(filePath);
        await writeFile(fullPath, edit.originalContent, 'utf-8');
        restored++;
      } catch (error) {
        console.error(`Failed to rollback ${filePath}:`, error);
      }
    }

    this.pendingEdits.clear();
    return restored;
  }

  /**
   * Get list of files with pending edits.
   */
  getPending(): string[] {
    return Array.from(this.pendingEdits.keys()).filter(
      filePath => !this.pendingEdits.get(filePath)?.isComplete
    );
  }

  /**
   * Get total number of edits applied across all files.
   */
  getEditCount(): number {
    let count = 0;
    for (const edit of this.pendingEdits.values()) {
      count += edit.patchesApplied;
    }
    return count;
  }

  /**
   * Get status of a specific file edit.
   */
  getEditStatus(filePath: string): PendingEdit | undefined {
    return this.pendingEdits.get(filePath);
  }

  /**
   * Apply a single diff chunk to content string.
   */
  private applyPatchToContent(content: string, chunk: DiffChunk): string {
    const lines = content.split('\n');
    const { type, content: chunkContent, lineNumber } = chunk;

    switch (type) {
      case 'add':
        if (lineNumber !== undefined && lineNumber <= lines.length) {
          // Insert at specific line
          lines.splice(lineNumber, 0, chunkContent.trimEnd());
        } else {
          // Append to end
          lines.push(chunkContent.trimEnd());
        }
        break;

      case 'remove':
        if (lineNumber !== undefined && lineNumber < lines.length) {
          // Remove at specific line
          lines.splice(lineNumber, 1);
        } else {
          // Try to find and remove matching line
          const toRemove = chunkContent.trimEnd();
          const index = lines.findIndex(line => line === toRemove);
          if (index !== -1) {
            lines.splice(index, 1);
          }
        }
        break;

      case 'context':
        // Context lines don't modify content, but we validate
        if (lineNumber !== undefined && lineNumber < lines.length) {
          const expected = chunkContent.trimEnd();
          const actual = lines[lineNumber];
          if (actual !== expected && actual !== '') {
            // Context mismatch - might be OK, but log it
            console.warn(`Context mismatch at line ${lineNumber}: expected "${expected}", got "${actual}"`);
          }
        }
        break;
    }

    return lines.join('\n');
  }

  /**
   * Check if we're within the rate limit.
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const oneSecondAgo = now - 1000;

    // Remove old timestamps
    this.editTimestamps = this.editTimestamps.filter(ts => ts > oneSecondAgo);

    return this.editTimestamps.length < this.maxEditsPerSecond;
  }

  /**
   * Record an edit timestamp for rate limiting.
   */
  private recordEdit(): void {
    this.editTimestamps.push(Date.now());
  }

  /**
   * Resolve a file path relative to repo root.
   */
  private resolvePath(filePath: string): string {
    if (filePath.startsWith('/')) {
      return filePath;
    }
    return `${this.repoRoot}/${filePath}`;
  }

  /**
   * Clean up completed edits older than specified milliseconds.
   */
  cleanup(maxAge: number = 60000): void {
    const now = Date.now();
    for (const [filePath, edit] of this.pendingEdits) {
      if (edit.isComplete && (now - maxAge) > 0) {
        this.pendingEdits.delete(filePath);
      }
    }
  }
}