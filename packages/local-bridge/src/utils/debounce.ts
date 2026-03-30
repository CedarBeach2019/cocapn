/**
 * DebounceTimer — debounce rapid calls into a single delayed execution.
 *
 * Uses a pattern where:
 *   - Each call resets the timer
 *   - Execution happens after delay_ms of no new calls
 *   - The pending function can be flushed immediately
 *
 * Common use case: batch multiple rapid file edits into a single git commit.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface DebounceTimerOptions {
  /** Delay in milliseconds before executing the pending function */
  delayMs: number;
  /** The function to execute after the debounce period */
  fn: () => void | Promise<void>;
}

// ─── DebounceTimer ─────────────────────────────────────────────────────────────

export class DebounceTimer {
  private options: DebounceTimerOptions;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private pending = false;

  constructor(options: DebounceTimerOptions) {
    this.options = options;
  }

  /**
   * Schedule the function to run after delay_ms.
   * If already scheduled, resets the timer (debounce effect).
   */
  schedule(): void {
    // Clear any existing timer
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
    }

    this.pending = true;
    this.timerId = setTimeout(() => {
      this.pending = false;
      this.timerId = null;
      this.options.fn();
    }, this.options.delayMs);
  }

  /**
   * Immediately execute the pending function if scheduled.
   * Does nothing if no function is pending.
   */
  async flush(): Promise<void> {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.pending) {
      this.pending = false;
      await this.options.fn();
    }
  }

  /**
   * Cancel any pending execution without running the function.
   */
  cancel(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.pending = false;
  }

  /** Returns true if a function execution is currently scheduled */
  isScheduled(): boolean {
    return this.pending;
  }

  /** Clear any pending timers (call before dropping reference) */
  dispose(): void {
    this.cancel();
  }
}
