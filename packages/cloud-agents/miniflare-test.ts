/**
 * Miniflare integration test for Cocapn Cloud Agent Worker.
 *
 * This file demonstrates how to test the Cloudflare Worker locally using Miniflare.
 * Run with: npx miniflare --modules --wrangler wrangler.toml test tests/miniflare.test.ts
 *
 * For now, this is a basic smoke test. The full test suite is in tests/worker.test.ts.
 */

import { describe, it, expect } from "vitest";

describe("Miniflare Integration", () => {
  it("should be able to import the worker", async () => {
    // This test verifies that the worker module can be imported
    // In a real Miniflare setup, you would test actual HTTP requests
    const workerModule = await import("./src/worker.js");
    expect(workerModule).toBeDefined();
    expect(workerModule.AdmiralDO).toBeDefined();
  });

  it("should have the correct export types", async () => {
    const workerModule = await import("./src/worker.js");
    // Verify the default export exists (the fetch handler)
    expect(workerModule.default).toBeDefined();
    // Verify AdmiralDO is exported
    expect(workerModule.AdmiralDO).toBeDefined();
  });
});
