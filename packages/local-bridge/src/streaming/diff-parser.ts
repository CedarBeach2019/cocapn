/**
 * DiffStreamParser — parse diffs as they stream in from LLM responses.
 *
 * Supports three diff formats:
 * 1. Unified diff: @@ -old,+new @@ with +/- lines
 * 2. Markdown code fences: ```diff blocks
 * 3. Aider SEARCH/REPLACE: <<<< SEARCH / >>>> REPLACE blocks
 *
 * The parser buffers incoming chunks and emits complete DiffChunk objects
 * as they are parsed. Incomplete chunks are held in the buffer until more
 * data arrives or flush() is called.
 */

/**
 * A parsed diff chunk ready to be applied.
 */
export interface DiffChunk {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber?: number;
  file?: string;
  isComplete: boolean;
}

/**
 * Parser state for tracking position within diff blocks.
 */
interface ParserState {
  inUnifiedDiff: boolean;
  inMarkdownFence: boolean;
  inSearchReplace: boolean;
  currentFile: string | null;
  expectedNewLine: number;
  buffer: string;
}

/**
 * DiffStreamParser parses streaming text into DiffChunk objects.
 *
 * Usage:
 * ```typescript
 * const parser = new DiffStreamParser();
 * for await (const chunk of stream) {
 *   const diffs = parser.feed(chunk);
 *   for (const diff of diffs) {
 *     applyDiff(diff);
 *   }
 * }
 * const remaining = parser.flush();
 * ```
 */
export class DiffStreamParser {
  private state: ParserState;

  constructor() {
    this.state = {
      inUnifiedDiff: false,
      inMarkdownFence: false,
      inSearchReplace: false,
      currentFile: null,
      expectedNewLine: 0,
      buffer: '',
    };
  }

  /**
   * Feed a chunk of streamed text to the parser.
   * Returns an array of complete DiffChunk objects.
   */
  feed(chunk: string): DiffChunk[] {
    this.state.buffer += chunk;
    const chunks: DiffChunk[] = [];

    // Process buffer until exhausted
    let processed = 0;
    while (processed < this.state.buffer.length) {
      const remaining = this.state.buffer.slice(processed);
      const result = this.parseNextChunk(remaining);

      if (result.chunks.length > 0) {
        chunks.push(...result.chunks);
      }

      if (result.consumed === 0) {
        // Can't process more, wait for more data
        break;
      }

      processed += result.consumed;
    }

    // Update buffer to unprocessed portion
    this.state.buffer = this.state.buffer.slice(processed);
    return chunks;
  }

  /**
   * Signal end of stream, return any remaining buffered diffs.
   */
  flush(): DiffChunk[] {
    const chunks: DiffChunk[] = [];

    // Process any remaining buffer
    if (this.state.buffer.trim().length > 0) {
      const result = this.parseNextChunk(this.state.buffer);
      chunks.push(...result.chunks);
    }

    // Close any open diff blocks
    if (this.state.inUnifiedDiff || this.state.inMarkdownFence || this.state.inSearchReplace) {
      // Mark final chunk as complete
      if (chunks.length > 0) {
        chunks[chunks.length - 1].isComplete = true;
      }
    }

    this.reset();
    return chunks;
  }

  /**
   * Reset parser state.
   */
  reset(): void {
    this.state = {
      inUnifiedDiff: false,
      inMarkdownFence: false,
      inSearchReplace: false,
      currentFile: null,
      expectedNewLine: 0,
      buffer: '',
    };
  }

  /**
   * Get current parser state for debugging.
   */
  getState(): ParserState {
    return { ...this.state };
  }

  /**
   * Parse the next chunk from the buffer.
   * Returns chunks parsed and bytes consumed.
   */
  private parseNextChunk(input: string): { chunks: DiffChunk[]; consumed: number } {
    const chunks: DiffChunk[] = [];
    let consumed = 0;

    // Check for unified diff header
    if (!this.state.inUnifiedDiff) {
      const unifiedMatch = input.match(/^@@\s+-(\d+),?\d*\s+\+(\d+),?\d*\s+@@/);
      if (unifiedMatch) {
        this.state.inUnifiedDiff = true;
        this.state.expectedNewLine = parseInt(unifiedMatch[2], 10);
        consumed = unifiedMatch[0].length;
        return { chunks, consumed };
      }
    }

    // Check for markdown diff fence
    if (!this.state.inMarkdownFence) {
      const fenceMatch = input.match(/^```diff\s*\n/);
      if (fenceMatch) {
        this.state.inMarkdownFence = true;
        consumed = fenceMatch[0].length;
        return { chunks, consumed };
      }
    }

    // Check for end of markdown fence
    if (this.state.inMarkdownFence) {
      const endFenceMatch = input.match(/^```\s*\n/);
      if (endFenceMatch) {
        this.state.inMarkdownFence = false;
        consumed = endFenceMatch[0].length;
        // Mark previous chunk as complete if exists
        if (chunks.length > 0) {
          chunks[chunks.length - 1].isComplete = true;
        }
        return { chunks, consumed };
      }
    }

    // Check for Aider SEARCH/REPLACE block
    if (!this.state.inSearchReplace) {
      const searchMatch = input.match(/^<<<<\s*SEARCH\s*\n/);
      if (searchMatch) {
        this.state.inSearchReplace = true;
        consumed = searchMatch[0].length;
        return { chunks, consumed };
      }
    }

    // Check for REPLACE marker in SEARCH/REPLACE
    if (this.state.inSearchReplace) {
      const replaceMatch = input.match(/^>>>>\s*REPLACE\s*\n/);
      if (replaceMatch) {
        // Transition from SEARCH to REPLACE mode
        // For now, we'll treat this as a separator
        consumed = replaceMatch[0].length;
        return { chunks, consumed };
      }

      // Check for end of SEARCH/REPLACE block
      const endMatch = input.match(/^====\s*\n/);
      if (endMatch) {
        this.state.inSearchReplace = false;
        consumed = endMatch[0].length;
        if (chunks.length > 0) {
          chunks[chunks.length - 1].isComplete = true;
        }
        return { chunks, consumed };
      }
    }

    // Parse diff lines
    const lineMatch = input.match(/^([^\n]*\n?)/);
    if (!lineMatch) {
      return { chunks, consumed };
    }

    const line = lineMatch[1];
    consumed = lineMatch[0].length;

    // Skip empty lines when not in a diff block
    if (!this.state.inUnifiedDiff && !this.state.inMarkdownFence && !this.state.inSearchReplace) {
      if (line.trim() === '') {
        return { chunks, consumed };
      }
    }

    // Parse the line based on current state
    const chunk = this.parseLine(line);
    if (chunk) {
      chunks.push(chunk);
    }

    return { chunks, consumed };
  }

  /**
   * Parse a single line into a DiffChunk if possible.
   */
  private parseLine(line: string): DiffChunk | null {
    const trimmed = line.trimEnd();

    // File header in unified diff
    const fileMatch = trimmed.match(/^[\+\-]{3}\s+(\S+)/);
    if (fileMatch) {
      this.state.currentFile = fileMatch[1];
      return null; // Don't emit file headers as chunks
    }

    // Unified diff lines
    if (this.state.inUnifiedDiff || this.state.inMarkdownFence) {
      if (trimmed.startsWith('+')) {
        return {
          type: 'add',
          content: trimmed.slice(1) + '\n',
          lineNumber: this.state.expectedNewLine++,
          file: this.state.currentFile || undefined,
          isComplete: false,
        };
      } else if (trimmed.startsWith('-')) {
        return {
          type: 'remove',
          content: trimmed.slice(1) + '\n',
          file: this.state.currentFile || undefined,
          isComplete: false,
        };
      } else if (trimmed.startsWith(' ') || trimmed.startsWith('@')) {
        // Context line or hunk header
        if (!trimmed.startsWith('@')) {
          this.state.expectedNewLine++;
        }
        return {
          type: 'context',
          content: trimmed.slice(1) + '\n',
          lineNumber: this.state.expectedNewLine++,
          file: this.state.currentFile || undefined,
          isComplete: false,
        };
      }
    }

    // SEARCH/REPLACE content
    if (this.state.inSearchReplace) {
      // In SEARCH mode, all lines are removals
      // In REPLACE mode, all lines are additions
      // For simplicity, we'll treat everything as context until we implement proper mode tracking
      return {
        type: 'context',
        content: trimmed + '\n',
        file: this.state.currentFile || undefined,
        isComplete: false,
      };
    }

    return null;
  }
}