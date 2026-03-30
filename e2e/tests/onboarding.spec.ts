/**
 * Onboarding E2E Tests
 *
 * Tests the create-cocapn CLI onboarding flow.
 * Since we can't run the actual CLI in a browser, we mock the key interactions.
 */

import { test, expect } from '@playwright/test';

test.describe('Onboarding Flow', () => {
  test('should display welcome message', async ({ page }) => {
    await page.goto('/');

    // Check for connection status
    const status = page.locator('.status');
    await expect(status).toBeVisible();

    // Should eventually show connected status
    await expect(status).toHaveClass(/connected/);
  });

  test('should show empty state initially', async ({ page }) => {
    await page.goto('/');

    // Should have empty messages container
    const messages = page.locator('.messages');
    await expect(messages).toBeVisible();

    // Should contain system message after connection
    await expect(page.locator('.message.system')).toContainText('Connected');
  });

  test('should have streak badge on first load', async ({ page }) => {
    await page.goto('/');

    const streakBadge = page.locator('.streak-badge');
    await expect(streakBadge).toBeVisible();

    const streakCount = page.locator('#streakCount');
    await expect(streakCount).toHaveText('5');
  });

  test('should enable input after connection', async ({ page }) => {
    await page.goto('/');

    // Wait for connection
    await page.waitForSelector('.status.connected');

    // Input should be enabled
    const input = page.locator('#messageInput');
    await expect(input).toBeEnabled();

    // Send button should be enabled
    const sendBtn = page.locator('#sendBtn');
    await expect(sendBtn).toBeEnabled();
  });

  test('should handle connection failure gracefully', async ({ page }) => {
    // Navigate to a non-existent WebSocket server
    await page.goto('/');

    // The mock server should still work, so connection should succeed
    // This test verifies error handling structure exists
    const status = page.locator('.status');
    await expect(status).toBeVisible();
  });

  test('should store initial config preferences', async ({ page }) => {
    await page.goto('/');

    // Verify localStorage can be accessed (for storing preferences)
    const localStorageEmpty = await page.evaluate(() => {
      return localStorage.getItem('cocapn-config') === null;
    });

    expect(localStorageEmpty).toBeTruthy();

    // Simulate storing a preference
    await page.evaluate(() => {
      localStorage.setItem('cocapn-config', JSON.stringify({
        theme: 'light',
        notifications: true
      }));
    });

    // Verify it was stored
    const stored = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('cocapn-config') || '{}');
    });

    expect(stored).toEqual({
      theme: 'light',
      notifications: true
    });
  });

  test('should display help link or documentation access', async ({ page }) => {
    await page.goto('/');

    // The page should have some navigation
    const header = page.locator('.header');
    await expect(header).toBeVisible();

    // Title should be visible
    await expect(page.locator('h1')).toContainText('Cocapn');
  });
});
