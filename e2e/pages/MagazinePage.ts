/**
 * MagazinePage — Page Object for magazine/feed view
 *
 * Handles viewing updates, streak badges, and feed layout.
 */

import { Page, Locator } from '@playwright/test';

export class MagazinePage {
  readonly page: Page;
  readonly updatesContainer: Locator;
  readonly streakBanner: Locator;
  readonly bannerStreak: Locator;
  readonly headerStreak: Locator;
  readonly emptyState: Locator;
  readonly updateCards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.updatesContainer = page.locator('.updates');
    this.streakBanner = page.locator('.streak-banner');
    this.bannerStreak = page.locator('#bannerStreak');
    this.headerStreak = page.locator('#headerStreak');
    this.emptyState = page.locator('.empty-state');
    this.updateCards = page.locator('.update');
  }

  /**
   * Navigate to the magazine page
   */
  async goto() {
    await this.page.goto('/magazine');
  }

  /**
   * Get the current streak count from banner
   */
  async getBannerStreak(): Promise<number> {
    const text = await this.bannerStreak.textContent();
    return parseInt(text || '0', 10);
  }

  /**
   * Get the current streak count from header
   */
  async getHeaderStreak(): Promise<number> {
    const text = await this.headerStreak.textContent();
    return parseInt(text || '0', 10);
  }

  /**
   * Get the number of displayed updates
   */
  async getUpdateCount(): Promise<number> {
    return await this.updateCards.count();
  }

  /**
   * Get the content of a specific update
   */
  async getUpdateContent(index: number): Promise<string> {
    const update = this.updateCards.nth(index);
    return await update.locator('.update-content').textContent() || '';
  }

  /**
   * Get the streak badge value from a specific update
   */
  async getUpdateStreak(index: number): Promise<number> {
    const update = this.updateCards.nth(index);
    const text = await update.locator('.update-streak').textContent();
    const match = text?.match(/Day (\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Check if the empty state is visible
   */
  async isEmptyStateVisible(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Wait for updates to load
   */
  async waitForUpdates(): Promise<void> {
    await this.updatesContainer.waitFor({ state: 'visible' });
  }

  /**
   * Wait for a specific update to appear
   */
  async waitForUpdate(content: string): Promise<void> {
    await this.page.locator('.update', { hasText: content }).waitFor();
  }

  /**
   * Verify that streaks are displayed in ascending order
   */
  async verifyStreakOrder(): Promise<boolean> {
    const count = await this.getUpdateCount();
    const streaks: number[] = [];

    for (let i = 0; i < count; i++) {
      streaks.push(await this.getUpdateStreak(i));
    }

    // Check that streaks are in ascending order (oldest first)
    for (let i = 1; i < streaks.length; i++) {
      if (streaks[i] < streaks[i - 1]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Take a screenshot of the magazine layout
   */
  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path, fullPage: true });
  }
}
