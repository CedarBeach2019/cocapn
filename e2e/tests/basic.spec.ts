/**
 * Basic E2E Test - verifies Playwright setup
 */

import { test, expect } from '@playwright/test';

test('basic page load test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);
});

test('basic element test', async ({ page }) => {
  await page.goto('https://example.com');
  const heading = page.locator('h1');
  await expect(heading).toHaveText('Example Domain');
});
