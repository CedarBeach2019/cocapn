/**
 * Tests for MiddlewarePipeline — ordering, error propagation, next() safety.
 */

import { describe, it, expect } from "vitest";
import { MiddlewarePipeline } from "../../src/middleware/pipeline.js";
import type { Middleware, MiddlewareContext } from "../../src/middleware/types.js";

function makeRequest(path = "/", method = "GET", headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { method, headers });
}

describe("MiddlewarePipeline", () => {
  it("returns 404 when no middleware is registered", async () => {
    const pipeline = new MiddlewarePipeline();
    const res = await pipeline.execute(makeRequest(), "127.0.0.1");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: "Not Found" });
  });

  it("runs a single middleware that sets a response", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (ctx, next) => {
      ctx.response = new Response("ok", { status: 200 });
      await next();
    });
    const res = await pipeline.execute(makeRequest(), "127.0.0.1");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("runs middleware in registration order", async () => {
    const order: number[] = [];
    const mw = (n: number): Middleware => async (_ctx, next) => {
      order.push(n);
      await next();
    };

    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw(1));
    pipeline.use(mw(2));
    pipeline.use(mw(3));
    pipeline.use(async (ctx, next) => {
      ctx.response = new Response("done");
      await next();
    });

    await pipeline.execute(makeRequest(), "127.0.0.1");
    expect(order).toEqual([1, 2, 3]);
  });

  it("shares state across middleware", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (ctx, next) => {
      ctx.state.set("foo", "bar");
      await next();
    });
    pipeline.use(async (ctx, next) => {
      expect(ctx.state.get("foo")).toBe("bar");
      ctx.state.set("baz", 42);
      await next();
    });
    pipeline.use(async (ctx, next) => {
      expect(ctx.state.get("baz")).toBe(42);
      ctx.response = new Response("ok");
      await next();
    });

    const res = await pipeline.execute(makeRequest(), "127.0.0.1");
    expect(res.status).toBe(200);
  });

  it("propagates thrown errors", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async () => {
      throw new Error("boom");
    });

    await expect(pipeline.execute(makeRequest(), "127.0.0.1")).rejects.toThrow("boom");
  });

  it("error is caught by errorHandler middleware registered first", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (ctx, next) => {
      try {
        await next();
      } catch (err) {
        ctx.response = new Response(
          JSON.stringify({ error: (err as Error).message }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    });
    pipeline.use(async () => {
      throw new Error("boom");
    });

    const res = await pipeline.execute(makeRequest(), "127.0.0.1");
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "boom" });
  });

  it("short-circuits when middleware sets response without calling next", async () => {
    const order: number[] = [];
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (ctx) => {
      order.push(1);
      ctx.response = new Response("blocked", { status: 403 });
      // NOT calling next()
    });
    pipeline.use(async (ctx) => {
      order.push(2);
      await new Promise(() => {}); // should never reach
    });

    const res = await pipeline.execute(makeRequest(), "127.0.0.1");
    expect(res.status).toBe(403);
    expect(order).toEqual([1]);
  });

  it("throws if next() is called multiple times", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (_ctx, next) => {
      await next();
      await next(); // second call — should throw
    });

    await expect(pipeline.execute(makeRequest(), "127.0.0.1")).rejects.toThrow(
      "next() called multiple times",
    );
  });

  it("use() returns this for chaining", () => {
    const pipeline = new MiddlewarePipeline();
    const result = pipeline.use(async (_ctx, next) => next());
    expect(result).toBe(pipeline);
  });

  it("clear() removes all middleware", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (ctx, next) => {
      ctx.response = new Response("ok");
      await next();
    });
    expect(pipeline.length).toBe(1);

    pipeline.clear();
    expect(pipeline.length).toBe(0);

    const res = await pipeline.execute(makeRequest(), "127.0.0.1");
    expect(res.status).toBe(404);
  });

  it("sets ip and startTime on the context", async () => {
    let captured: MiddlewareContext | undefined;
    const pipeline = new MiddlewarePipeline();
    pipeline.use(async (ctx, next) => {
      captured = ctx;
      ctx.response = new Response("ok");
      await next();
    });

    await pipeline.execute(makeRequest(), "10.0.0.1");
    expect(captured).toBeDefined();
    expect(captured!.ip).toBe("10.0.0.1");
    expect(captured!.startTime).toBeGreaterThan(0);
    expect(captured!.state).toBeInstanceOf(Map);
  });
});
