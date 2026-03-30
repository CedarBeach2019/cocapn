/**
 * Magazine and Streaks E2E Tests
 *
 * Tests the magazine/feed layout, update display, and streak badges.
 */

import { test, expect } from '@playwright/test';
import { MagazinePage } from '../pages/MagazinePage.js';
import { ChatPage } from '../pages/ChatPage.js';

test.describe('Magazine Layout', () => {
  let magazinePage: MagazinePage;

  test.beforeEach(async ({ page }) => {
    magazinePage = new MagazinePage(page);
    await magazinePage.goto();
  });

  test('should display magazine page', async ({ page }) => {
    await magazinePage.waitForUpdates();

    // Header should be visible
    await expect(page.locator('h1')).toContainText('Magazine');

    // Streak banner should be visible
    await expect(magazinePage.streakBanner).toBeVisible();
  });

  test('should show streak banner prominently', async ({ page }) => {
    await magazinePage.waitForUpdates();

    const bannerStreak = await magazinePage.getBannerStreak();
    expect(bannerStreak).toBeGreaterThan(0);

    // Banner should have fire emoji
    await expect(magazinePage.streakBanner).toContainText('🔥');
  });

  test('should show streak in header', async ({ page }) => {
    await magazinePage.waitForUpdates();

    const headerStreak = await magazinePage.getHeaderStreak();
    expect(headerStreak).toBeGreaterThan(0);

    // Header streak should match banner streak
    const bannerStreak = await magazinePage.getBannerStreak();
    expect(headerStreak).toBe(bannerStreak);
  });

  test('should display empty state when no updates', async ({ page, context }) => {
    // Clear any existing updates by clearing cookies/storage
    await context.clearCookies();

    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    // Should show empty state message
    const isEmpty = await magazinePage.isEmptyStateVisible();
    expect(isEmpty).toBeTruthy();

    const updateCount = await magazinePage.getUpdateCount();
    expect(updateCount).toBe(0);
  });

  test('should display updates in reverse chronological order', async ({ page, context }) => {
    // First, create some updates via the chat page
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    // Create a few updates
    for (let i = 1; i <= 3; i++) {
      await chatPage.messageInput.fill(`Update ${i}`);
      await chatPage.publishUpdate();
      await page.waitForTimeout(100);
    }

    // Now go to magazine page
    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    const updateCount = await magazinePage.getUpdateCount();
    expect(updateCount).toBeGreaterThanOrEqual(3);

    // Verify streak order (ascending from top to bottom)
    const streaksInOrder = await magazinePage.verifyStreakOrder();
    expect(streaksInOrder).toBeTruthy();
  });

  test('should show streak badge on each update', async ({ page, context }) => {
    // Create an update first
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    await chatPage.messageInput.fill('Test update with streak');
    await chatPage.publishUpdate();

    // Navigate to magazine
    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    const updateCount = await magazinePage.getUpdateCount();
    if (updateCount > 0) {
      // First update should have a streak badge
      const firstUpdateStreak = await magazinePage.getUpdateStreak(0);
      expect(firstUpdateStreak).toBeGreaterThan(0);

      // Streak badge should be visible
      const firstUpdate = magazinePage.updateCards.first();
      await expect(firstUpdate.locator('.update-streak')).toContainText('Day');
    }
  });

  test('should display update timestamp', async ({ page, context }) => {
    // Create an update
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    await chatPage.messageInput.fill('Timestamp test update');
    await chatPage.publishUpdate();

    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    const updateCount = await magazinePage.getUpdateCount();
    if (updateCount > 0) {
      // Should have timestamp element
      const firstUpdate = magazinePage.updateCards.first();
      await expect(firstUpdate.locator('.update-time')).toBeVisible();
    }
  });

  test('should display update content correctly', async ({ page, context }) => {
    const testContent = 'This is a test update for content display';

    // Create an update
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    await chatPage.messageInput.fill(testContent);
    await chatPage.publishUpdate();

    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    const updateCount = await magazinePage.getUpdateCount();
    if (updateCount > 0) {
      // Should find the content in an update
      const found = await page.locator('.update-content', { hasText: testContent }).count();
      expect(found).toBeGreaterThan(0);
    }
  });

  test('should handle long content gracefully', async ({ page, context }) => {
    const longContent = 'This is a very long update that should wrap properly in the magazine layout. '.repeat(5);

    // Create an update
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    await chatPage.messageInput.fill(longContent);
    await chatPage.publishUpdate();

    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    // Long content should not break layout
    const firstUpdate = magazinePage.updateCards.first();
    await expect(firstUpdate).toBeVisible();

    // Content should be visible
    await expect(firstUpdate.locator('.update-content')).toContainText('very long update');
  });
});

test.describe('Streak Mechanics', () => {
  test('should increment streak on daily publish', async ({ page, context }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    const initialStreak = await chatPage.getStreakCount();

    // Publish update
    await chatPage.messageInput.fill('Day 1 update');
    await chatPage.publishUpdate();
    await chatPage.waitForStreakChange(initialStreak);

    const newStreak = await chatPage.getStreakCount();
    expect(newStreak).toBe(initialStreak + 1);

    // Verify magazine shows updated streak
    const magazinePage = new MagazinePage(page);
    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    const bannerStreak = await magazinePage.getBannerStreak();
    expect(bannerStreak).toBe(newStreak);
  });

  test('should display streak celebration on milestones', async ({ page }) => {
    const magazinePage = new MagazinePage(page);
    await magazinePage.goto();

    const bannerStreak = await magazinePage.getBannerStreak();

    // Milestone streaks (5, 10, 30, 100) might have special display
    // This test verifies the structure for such celebrations
    if (bannerStreak >= 5) {
      // Should show prominently in banner
      await expect(magazinePage.streakBanner).toBeVisible();
      await expect(magazinePage.streakBanner).toContainText('🔥');
    }
  });

  test('should sync streak across chat and magazine', async ({ page }) => {
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    const chatStreak = await chatPage.getStreakCount();

    const magazinePage = new MagazinePage(page);
    await magazinePage.goto();

    const bannerStreak = await magazinePage.getBannerStreak();
    const headerStreak = await magazinePage.getHeaderStreak();

    // All streak displays should match
    expect(chatStreak).toBe(bannerStreak);
    expect(bannerStreak).toBe(headerStreak);
  });

  test('should persist streak data', async ({ page, context }) => {
    // Publish an update
    const chatPage = new ChatPage(page);
    await chatPage.goto();

    await chatPage.messageInput.fill('Persistence test');
    await chatPage.publishUpdate();

    const streak1 = await chatPage.getStreakCount();

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    const streak2 = await chatPage.getStreakCount();
    expect(streak2).toBe(streak1);
  });
});

test.describe('Magazine Responsive Design', () => {
  test('should display correctly on mobile', async ({ page, viewport }) => {
    const magazinePage = new MagazinePage(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    // Should still be readable
    await expect(page.locator('h1')).toBeVisible();
    await expect(magazinePage.streakBanner).toBeVisible();
  });

  test('should display correctly on tablet', async ({ page }) => {
    const magazinePage = new MagazinePage(page);

    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    // Layout should adjust
    const header = page.locator('.header');
    await expect(header).toBeVisible();
  });

  test('should display correctly on desktop', async ({ page }) => {
    const magazinePage = new MagazinePage(page);

    // Set desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await magazinePage.goto();
    await magazinePage.waitForUpdates();

    // Full layout should be visible
    await expect(page.locator('.container')).toBeVisible();
  });
});
