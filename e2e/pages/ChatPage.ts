/**
 * ChatPage — Page Object for chat interactions
 *
 * Handles sending messages and receiving agent responses.
 */

import { Page, Locator } from '@playwright/test';

export class ChatPage {
  readonly page: Page;
  readonly messageInput: Locator;
  readonly sendButton: Locator;
  readonly publishButton: Locator;
  readonly messagesContainer: Locator;
  readonly streakBadge: Locator;

  constructor(page: Page) {
    this.page = page;
    this.messageInput = page.locator('#messageInput');
    this.sendButton = page.locator('#sendBtn');
    this.publishButton = page.locator('#publishBtn');
    this.messagesContainer = page.locator('.messages');
    this.streakBadge = page.locator('#streakCount');
  }

  /**
   * Navigate to the chat page
   */
  async goto() {
    await this.page.goto('/chat');
  }

  /**
   * Send a chat message
   */
  async sendMessage(message: string): Promise<void> {
    await this.messageInput.fill(message);
    await this.sendButton.click();
  }

  /**
   * Send a chat message by pressing Enter
   */
  async sendMessageWithEnter(message: string): Promise<void> {
    await this.messageInput.fill(message);
    await this.messageInput.press('Enter');
  }

  /**
   * Get all messages currently displayed
   */
  async getMessages(): Promise<string[]> {
    const messages = await this.page.locator('.message').allTextContents();
    return messages;
  }

  /**
   * Wait for a message with specific text to appear
   */
  async waitForMessage(text: string): Promise<void> {
    await this.page.locator('.message', { hasText: text }).waitFor();
  }

  /**
   * Wait for an agent response
   */
  async waitForAgentResponse(): Promise<void> {
    await this.page.locator('.message.agent').waitFor();
  }

  /**
   * Get the last agent message
   */
  async getLastAgentMessage(): Promise<string> {
    const messages = await this.page.locator('.message.agent').allTextContents();
    return messages[messages.length - 1] || '';
  }

  /**
   * Publish the current input as an update
   */
  async publishUpdate(): Promise<void> {
    await this.publishButton.click();
  }

  /**
   * Get the current streak count
   */
  async getStreakCount(): Promise<number> {
    const text = await this.streakBadge.textContent();
    return parseInt(text || '0', 10);
  }

  /**
   * Wait for streak count to change
   */
  async waitForStreakChange(initialCount: number): Promise<void> {
    await this.page.waitForFunction(
      (count) => {
        const el = document.getElementById('streakCount');
        return el !== null && parseInt(el.textContent || '0') !== count;
      },
      initialCount,
      { timeout: 5000 }
    );
  }

  /**
   * Check if the send button is enabled
   */
  async canSend(): Promise<boolean> {
    const disabled = await this.sendButton.isDisabled();
    return !disabled;
  }

  /**
   * Clear the message input
   */
  async clearInput(): Promise<void> {
    await this.messageInput.fill('');
  }
}
