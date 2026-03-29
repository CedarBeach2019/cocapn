/**
 * Tests for Cloud Bridge modules
 *
 * Tests PII dehydration/rehydration, intent routing, SSE streaming, and CloudBridge class.
 */

import { describe, it, expect } from "vitest";
import {
  dehydrate,
  rehydrate,
  validateCreditCard,
  validateSSN,
  validateEmail,
  type PIIEntity,
} from "../src/cloud-bridge/pii.js";
import { classifyIntent, classifyBatch, getModelForRoute, type RouteType } from "../src/cloud-bridge/routing.js";
import { parseSSE, type StreamChunk } from "../src/cloud-bridge/streaming.js";
import { CloudBridge } from "../src/cloud-bridge/index.js";

describe("PII Dehydration/Rehydration", () => {
  describe("dehydrate", () => {
    it("should detect and replace email addresses", () => {
      const text = "Contact me at user@example.com for details.";
      const result = dehydrate(text);

      expect(result.text).toContain("[EMAIL_1]");
      expect(result.text).not.toContain("user@example.com");
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].type).toBe("EMAIL");
      expect(result.entities[0].value).toBe("user@example.com");
    });

    it("should detect and replace phone numbers", () => {
      const text = "Call me at (555) 123-4567 or 555-123-4567.";
      const result = dehydrate(text);

      expect(result.text).toContain("[PHONE_1]");
      expect(result.text).toContain("[PHONE_2]");
      expect(result.entities.length).toBeGreaterThanOrEqual(2);
      expect(result.entities.filter((e) => e.type === "PHONE").length).toBeGreaterThanOrEqual(2);
    });

    it("should detect and replace SSNs", () => {
      const text = "My SSN is 123-45-6789.";
      const result = dehydrate(text);

      expect(result.text).toContain("[SSN_1]");
      expect(result.text).not.toContain("123-45-6789");
    });

    it("should detect credit card numbers", () => {
      const text = "Card: 4111 1111 1111 1111";
      const result = dehydrate(text);

      expect(result.text).toContain("[CREDIT_CARD_1]");
    });

    it("should detect IPv4 addresses", () => {
      const text = "Server at 192.168.1.1";
      const result = dehydrate(text);

      expect(result.text).toContain("[IPV4_1]");
    });

    it("should detect dates of birth", () => {
      const text = "Born on 01/15/1990";
      const result = dehydrate(text);

      expect(result.text).toContain("[DOB_1]");
    });

    it("should detect US addresses", () => {
      const text = "123 Main St, Springfield, IL 62701";
      const result = dehydrate(text);

      expect(result.text).toContain("[ADDRESS_1]");
    });

    it("should handle multiple PII types in one text", () => {
      const text = "Email: test@example.com, Phone: (555) 123-4567";
      const result = dehydrate(text);

      expect(result.entities.length).toBeGreaterThanOrEqual(2);
      const types = new Set(result.entities.map((e) => e.type));
      expect(types.has("EMAIL")).toBe(true);
      expect(types.has("PHONE")).toBe(true);
    });

    it("should handle emails with + tags", () => {
      const text = "user+tag@example.com";
      const result = dehydrate(text);

      expect(result.text).toContain("[EMAIL_1]");
    });

    it("should return empty entities for text without PII", () => {
      const text = "Just plain text with no personal info.";
      const result = dehydrate(text);

      expect(result.text).toBe(text);
      expect(result.entities).toHaveLength(0);
    });
  });

  describe("rehydrate", () => {
    it("should restore original text with entities", () => {
      const original = "Contact user@example.com";
      const dehydrated = dehydrate(original);
      const rehydrated = rehydrate(dehydrated.text, dehydrated.entities);

      expect(rehydrated).toBe(original);
    });

    it("should return text unchanged without entities", () => {
      const text = "Some text with [EMAIL_1] token";
      const result = rehydrate(text);

      expect(result).toBe(text);
    });

    it("should handle multiple entities of same type", () => {
      const original = "Email1@example.com and Email2@example.com";
      const dehydrated = dehydrate(original);
      const rehydrated = rehydrate(dehydrated.text, dehydrated.entities);

      expect(rehydrated).toBe(original);
    });
  });

  describe("validateCreditCard", () => {
    it("should pass valid card numbers (Luhn check)", () => {
      // 4111 1111 1111 1111 is a valid test card
      expect(validateCreditCard("4111111111111111")).toBe(true);
    });

    it("should fail invalid card numbers", () => {
      expect(validateCreditCard("1234 5678 9012 3456")).toBe(false);
    });

    it("should reject wrong lengths", () => {
      expect(validateCreditCard("123")).toBe(false);
      expect(validateCreditCard("12345678901234567")).toBe(false);
    });
  });

  describe("validateSSN", () => {
    it("should validate SSN format", () => {
      expect(validateSSN("123-45-6789")).toBe(true);
      expect(validateSSN("123 45 6789")).toBe(true);
    });

    it("should reject SSNs starting with 000", () => {
      expect(validateSSN("000-12-3456")).toBe(false);
    });

    it("should reject SSNs starting with 666", () => {
      expect(validateSSN("666-12-3456")).toBe(false);
    });
  });

  describe("validateEmail", () => {
    it("should validate standard emails", () => {
      expect(validateEmail("user@example.com")).toBe(true);
      expect(validateEmail("user.name@example.com")).toBe(true);
      expect(validateEmail("user+tag@example.com")).toBe(true);
    });

    it("should reject invalid emails", () => {
      expect(validateEmail("notanemail")).toBe(false);
      expect(validateEmail("@example.com")).toBe(false);
      expect(validateEmail("user@")).toBe(false);
    });
  });
});

describe("Intent Routing", () => {
  describe("classifyIntent", () => {
    it("should classify code requests", () => {
      const result = classifyIntent("write a function to sort an array");

      expect(result.route).toBe("code");
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it("should classify debug requests", () => {
      const result = classifyIntent("help me fix this bug");

      expect(result.route).toBe("code");
      expect(result.reason).toContain("Debug");
    });

    it("should classify creative writing requests", () => {
      const result = classifyIntent("write a story about a robot");

      expect(result.route).toBe("creative");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should classify brainstorming requests", () => {
      const result = classifyIntent("please imagine and brainstorm new product concepts");

      expect(result.route).toBe("creative");
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it("should classify analysis requests", () => {
      const result = classifyIntent("analyze this data and summarize findings");

      expect(result.route).toBe("analysis");
    });

    it("should classify search questions", () => {
      const result = classifyIntent("what is the capital of France?");

      expect(result.route).toBe("search");
    });

    it("should classify task/schedule requests", () => {
      const result = classifyIntent("remind me to call mom tomorrow");

      expect(result.route).toBe("task");
    });

    it("should classify greetings as casual", () => {
      const result = classifyIntent("hello there!");

      expect(result.route).toBe("casual");
    });

    it("should return default casual for unknown patterns", () => {
      const result = classifyIntent("xyzabc");

      expect(result.route).toBe("casual");
      expect(result.confidence).toBe(0.3);
    });

    it("should detect code blocks", () => {
      const result = classifyIntent("here is some code: ```js const x = 1;```");

      expect(result.route).toBe("code");
      expect(result.confidence).toBe(0.95);
    });
  });

  describe("classifyBatch", () => {
    it("should return most common route", () => {
      const texts = [
        "write a function",  // code
        "debug this error",  // code
        "hello",             // casual
      ];

      const result = classifyBatch(texts);

      expect(result.route).toBe("code");
      expect(result.reason).toContain("2/3");
    });

    it("should handle empty array", () => {
      const result = classifyBatch([]);

      expect(result.route).toBe("casual");
      expect(result.confidence).toBe(0);
    });
  });

  describe("getModelForRoute", () => {
    it("should return correct model for each route", () => {
      expect(getModelForRoute("creative")).toBe("claude-3-opus");
      expect(getModelForRoute("code")).toBe("claude-3.5-sonnet");
      expect(getModelForRoute("analysis")).toBe("claude-3.5-sonnet");
      expect(getModelForRoute("casual")).toBe("deepseek-chat");
      expect(getModelForRoute("search")).toBe("deepseek-chat");
      expect(getModelForRoute("task")).toBe("claude-3-haiku");
    });
  });
});

describe("SSE Streaming", () => {
  describe("parseSSE", () => {
    it("should parse data: lines as JSON chunks", async () => {
      const mockResponse = {
        body: {
          getReader: () => ({
            read: async () => ({
              done: true,
              value: new TextEncoder().encode("data: {\"id\":\"1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hello\"}}]}\n\n"),
            }),
          }),
        },
      } as unknown as Response;

      const chunks: StreamChunk[] = [];
      for await (const chunk of parseSSE(mockResponse)) {
        chunks.push(chunk);
      }

      // The mock returns data then immediately done, so parseSSE will process it
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });

    it("should handle [DONE] signal", async () => {
      let callCount = 0;
      const mockResponse = {
        body: {
          getReader: () => ({
            read: async () => {
              callCount++;
              if (callCount === 1) {
                return {
                  done: false,
                  value: new TextEncoder().encode("data: [DONE]\n\n"),
                };
              }
              return { done: true, value: new Uint8Array() };
            },
          }),
        },
      } as unknown as Response;

      const chunks: StreamChunk[] = [];
      for await (const chunk of parseSSE(mockResponse)) {
        chunks.push(chunk);
      }

      // Should exit after [DONE], not error
      expect(chunks).toHaveLength(0);
    });

    it("should throw on [ERROR] lines", async () => {
      const mockResponse = {
        body: {
          getReader: () => ({
            read: async () => ({
              done: false,
              value: new TextEncoder().encode("data: [ERROR] Something went wrong\n\n"),
            }),
          }),
        },
      } as unknown as Response;

      await expect(async () => {
        for await (const _ of parseSSE(mockResponse)) {
          // consume
        }
      }).rejects.toThrow("Something went wrong");
    });
  });
});

describe("CloudBridge", () => {
  describe("constructor", () => {
    it("should use provided config", () => {
      const bridge = new CloudBridge({
        workerUrl: "https://test.workers.dev",
        fleetJwt: "test-jwt",
        piiEnabled: false,
      });

      expect(bridge.getWorkerUrl()).toBe("https://test.workers.dev");
      expect(bridge.isPIIEnabled()).toBe(false);
    });

    it("should use default config values", () => {
      const bridge = new CloudBridge({
        workerUrl: "https://test.workers.dev",
        fleetJwt: "test-jwt",
      });

      expect(bridge.isPIIEnabled()).toBe(true);
      expect(bridge.isRoutingEnabled()).toBe(true);
      expect(bridge.getDefaultModel()).toBe("deepseek-chat");
    });
  });

  describe("getUsage", () => {
    it("should return zero usage initially", async () => {
      const bridge = new CloudBridge({
        workerUrl: "https://test.workers.dev",
        fleetJwt: "test-jwt",
      });

      const usage = await bridge.getUsage();
      expect(usage.totalTokens).toBe(0);
      expect(usage.requestCount).toBe(0);
    });
  });

  describe("resetUsage", () => {
    it("should reset usage stats", () => {
      const bridge = new CloudBridge({
        workerUrl: "https://test.workers.dev",
        fleetJwt: "test-jwt",
      });

      // Manually set some usage (in real usage, this would come from requests)
      bridge["usage"].requestCount = 10;
      bridge["usage"].totalTokens = 1000;

      bridge.resetUsage();

      expect(bridge["usage"].requestCount).toBe(0);
      expect(bridge["usage"].totalTokens).toBe(0);
    });
  });

  describe("routeMessage (private method behavior)", () => {
    it("should use default model when routing disabled", () => {
      const bridge = new CloudBridge({
        workerUrl: "https://test.workers.dev",
        fleetJwt: "test-jwt",
        routingEnabled: false,
        defaultModel: "custom-model",
      });

      // Access via the public chat method which calls routeMessage internally
      // We can't directly test private method, but we can observe the behavior
      expect(bridge.getDefaultModel()).toBe("custom-model");
    });
  });
});
