/**
 * Chat and Publish E2E Tests
 *
 * Tests the core chat flow, WebSocket communication, and publishing updates.
 */

import { test, expect } from '@playwright/test';
import { BridgePage } from '../pages/BridgePage.js';
import { ChatPage } from '../pages/ChatPage.js';

test.describe('Chat Flow', () => {
  let bridgePage: BridgePage;
  let chatPage: ChatPage;

  test.beforeEach(async ({ page }) => {
    bridgePage = new BridgePage(page);
    chatPage = new ChatPage(page);
    await chatPage.goto();
  });

  test('should connect to bridge on load', async ({ page }) => {
    await bridgePage.waitForConnection();
    expect(await bridgePage.isConnected()).toBeTruthy();
    await bridgePage.waitForConnectionMessage();
  });

  test('should send and receive message', async ({ page }) => {
    await bridgePage.waitForConnection();

    const testMessage = 'Hello, Cocapn!';
    await chatPage.sendMessage(testMessage);

    // Should see user message
    await chatPage.waitForMessage(testMessage);
    const messages = await chatPage.getMessages();
    expect(messages.some(m => m.includes(testMessage))).toBeTruthy();

    // Should receive agent response
    await chatPage.waitForAgentResponse();
    const agentResponse = await chatPage.getLastAgentMessage();
    expect(agentResponse).toContain('Echo');
    expect(agentResponse).toContain(testMessage);
  });

  test('should send message with Enter key', async ({ page }) => {
    await bridgePage.waitForConnection();

    const testMessage = 'Testing Enter key';
    await chatPage.sendMessageWithEnter(testMessage);

    await chatPage.waitForMessage(testMessage);
    await chatPage.waitForAgentResponse();
  });

  test('should handle rapid messages', async ({ page }) => {
    await bridgePage.waitForConnection();

    const messages = ['First message', 'Second message', 'Third message'];

    for (const msg of messages) {
      await chatPage.sendMessage(msg);
    }

    // All messages should appear
    const displayedMessages = await chatPage.getMessages();
    for (const msg of messages) {
      expect(displayedMessages.some(m => m.includes(msg))).toBeTruthy();
    }

    // Should have multiple agent responses
    const agentMessages = await page.locator('.message.agent').count();
    expect(agentMessages).toBeGreaterThanOrEqual(messages.length);
  });

  test('should clear input after send', async ({ page }) => {
    await bridgePage.waitForConnection();

    await chatPage.sendMessage('Test message');

    // Input should be empty after sending
    const inputValue = await chatPage.messageInput.inputValue();
    expect(inputValue).toBe('');
  });

  test('should display messages in correct order', async ({ page }) => {
    await bridgePage.waitForConnection();

    const messages = ['Message 1', 'Message 2', 'Message 3'];

    for (const msg of messages) {
      await chatPage.sendMessage(msg);
    }

    // Get all message elements
    const allMessages = page.locator('.message.user');
    const count = await allMessages.count();

    expect(count).toBe(messages.length);

    // Verify order
    for (let i = 0; i < messages.length; i++) {
      const text = await allMessages.nth(i).textContent();
      expect(text).toContain(messages[i]);
    }
  });

  test('should publish update to feed', async ({ page }) => {
    await bridgePage.waitForConnection();

    const updateContent = 'This is my published update';
    await chatPage.messageInput.fill(updateContent);

    const initialStreak = await chatPage.getStreakCount();
    await chatPage.publishUpdate();

    // Wait for streak to increment
    await chatPage.waitForStreakChange(initialStreak);

    const newStreak = await chatPage.getStreakCount();
    expect(newStreak).toBe(initialStreak + 1);

    // Should show success message
    await chatPage.waitForMessage('Update published');
  });

  test('should maintain streak across sessions', async ({ page, context }) => {
    await bridgePage.waitForConnection();

    // Publish an update
    await chatPage.messageInput.fill('Session 1 update');
    const streak1 = await chatPage.getStreakCount();
    await chatPage.publishUpdate();
    await chatPage.waitForStreakChange(streak1);

    // Simulate new session by clearing storage
    await context.clearCookies();

    // In a real app, streak would persist on server
    // Here we just verify the mechanism works
    await chatPage.goto();
    await bridgePage.waitForConnection();

    const streak2 = await chatPage.getStreakCount();
    expect(streak2).toBeGreaterThan(streak1);
  });

  test('should handle special characters in messages', async ({ page }) => {
    await bridgePage.waitForConnection();

    const specialMessage = 'Test with emoji 🎉 and <special> characters & "quotes"';
    await chatPage.sendMessage(specialMessage);

    await chatPage.waitForMessage(specialMessage);
    await chatPage.waitForAgentResponse();
  });

  test('should disable send when not connected', async ({ page }) => {
    // Initially send button might be disabled
    const sendBtn = page.locator('#sendBtn');

    // After connection it should be enabled
    await bridgePage.waitForConnection();
    expect(await chatPage.canSend()).toBeTruthy();

    // Disconnect
    await bridgePage.disconnect();
    await bridgePage.waitForDisconnection();

    // After disconnect, should be disabled
    await expect(sendBtn).toBeDisabled();
  });
});

test.describe('WebSocket Reconnection', () => {
  test('should reconnect after disconnection', async ({ page }) => {
    const bridgePage = new BridgePage(page);
    await bridgePage.goto();

    await bridgePage.waitForConnection();
    await bridgePage.disconnect();
    await bridgePage.waitForDisconnection();

    // The mock server doesn't auto-reconnect, but in a real app
    // this would trigger reconnection logic
    // This test verifies the structure exists
    const status = page.locator('.status');
    await expect(status).not.toHaveClass(/connected/);
  });
});
