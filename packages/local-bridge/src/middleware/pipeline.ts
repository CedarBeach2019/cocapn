/**
 * MiddlewarePipeline — composable async middleware chain.
 *
 * Usage:
 *   const pipeline = new MiddlewarePipeline();
 *   pipeline.use(cors());
 *   pipeline.use(timing());
 *   pipeline.use(logging());
 *   const response = await pipeline.execute(request, "127.0.0.1");
 */

import type { Middleware, MiddlewareContext } from "./types.js";

export class MiddlewarePipeline {
  private stack: Middleware[] = [];

  /** Add a middleware to the end of the chain. */
  use(middleware: Middleware): this {
    this.stack.push(middleware);
    return this;
  }

  /** Remove all middleware. */
  clear(): void {
    this.stack = [];
  }

  /** Number of registered middleware. */
  get length(): number {
    return this.stack.length;
  }

  /**
   * Execute the middleware chain against a request.
   *
   * Returns the final Response from ctx.response, or a 404 if no
   * middleware set one.
   */
  async execute(request: Request, ip: string): Promise<Response> {
    const ctx: MiddlewareContext = {
      request,
      state: new Map(),
      startTime: performance.now(),
      ip,
    };

    // Build the dispatch chain from right to left
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;

      const fn = this.stack[i];
      if (!fn) return; // end of chain

      await fn(ctx, () => dispatch(i + 1));
    };

    await dispatch(0);

    // Return the response set by some middleware, or 404
    if (ctx.response) return ctx.response;

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
