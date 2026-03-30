/**
 * Tests for LLMRateLimiter — acquire, release, rate limiting, provider penalties.
 *
 * NOTE: Timing-dependent tests (throttle, per-tenant wait) are tested with
 * real timers and short RPM to keep test duration reasonable.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMRateLimiter } from '../../src/queue/rate-limiter.js';

describe('LLMRateLimiter', () => {
  let limiter: LLMRateLimiter;

  beforeEach(() => {
    limiter = new LLMRateLimiter({
      requestsPerMinute: {
        test: 6,
      },
    });
  });

  afterEach(() => {
    limiter.reset();
  });

  describe('acquire', () => {
    it('should allow requests when under limit', async () => {
      await limiter.acquire('test');
    });

    it('should allow multiple requests up to the rate', async () => {
      // 6 RPM bucket starts with 6 tokens
      for (let i = 0; i < 6; i++) {
        await limiter.acquire('test');
      }
    });

    it('should allow different tenants independently', async () => {
      await limiter.acquire('test', 'tenant-a');
      await limiter.acquire('test', 'tenant-b');
    });

    it('should throttle when bucket is exhausted', async () => {
      // Use 1 RPM so a single acquire exhausts the bucket
      const slow = new LLMRateLimiter({ requestsPerMinute: { slow: 1 } });

      await slow.acquire('slow');

      // Second acquire should not resolve immediately
      let resolved = false;
      const promise = slow.acquire('slow').then(() => { resolved = true; });
      await new Promise((r) => setTimeout(r, 50));
      expect(resolved).toBe(false);

      // Clean up — we can't cancel acquire, so let the test timeout handle it
      // The promise will resolve after ~60s but the test will timeout before that
      // Instead, just verify the behavior and move on
      void promise;
      slow.reset();
    });
  });

  describe('release', () => {
    it('should be a no-op (token-bucket refills automatically)', () => {
      limiter.release('test');
      limiter.release('test', 'tenant-a');
    });
  });

  describe('getWaitTime', () => {
    it('should return 0 when tokens are available', () => {
      expect(limiter.getWaitTime('unknown')).toBe(0);
    });

    it('should return > 0 after exhausting tokens', async () => {
      const slow = new LLMRateLimiter({ requestsPerMinute: { slow: 1 } });
      await slow.acquire('slow');
      const waitTime = slow.getWaitTime('slow');
      expect(waitTime).toBeGreaterThan(0);
      slow.reset();
    });
  });

  describe('onRateLimit', () => {
    it('should halve the effective rate on 429', async () => {
      // Ensure bucket exists
      await limiter.acquire('test');
      const initialRate = limiter.getEffectiveRateLimit('test');

      limiter.onRateLimit('test');
      const reducedRate = limiter.getEffectiveRateLimit('test');

      expect(reducedRate).toBe(Math.floor(initialRate / 2));
    });

    it('should compound penalties on repeated 429s', async () => {
      await limiter.acquire('test');
      limiter.onRateLimit('test');
      limiter.onRateLimit('test');

      const rate = limiter.getEffectiveRateLimit('test');
      // 6 -> 3 -> 1 (halved twice, min 1)
      expect(rate).toBe(1);
    });
  });

  describe('onRateLimitRecovery', () => {
    it('should restore the rate limit', async () => {
      await limiter.acquire('test');
      limiter.onRateLimit('test');
      limiter.onRateLimitRecovery('test');

      expect(limiter.getEffectiveRateLimit('test')).toBe(6);
    });
  });

  describe('getEffectiveRateLimit', () => {
    it('should return default for unknown providers', () => {
      expect(limiter.getEffectiveRateLimit('unknown')).toBe(60);
    });

    it('should return configured rate for known providers', () => {
      expect(limiter.getEffectiveRateLimit('test')).toBe(6);
    });
  });

  describe('reset', () => {
    it('should clear all buckets', async () => {
      await limiter.acquire('test');
      limiter.reset();
      await limiter.acquire('test');
    });
  });
});
