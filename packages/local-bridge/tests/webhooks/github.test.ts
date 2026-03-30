/**
 * Tests for GitHub webhook handler
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { GitHubWebhookHandler } from '../../src/webhooks/handlers/github.js';

describe('GitHubWebhookHandler', () => {
  let handler: GitHubWebhookHandler;

  beforeEach(() => {
    handler = new GitHubWebhookHandler();
  });

  describe('handlePush', () => {
    it('should map push event to task.triggered and code.review', async () => {
      const pushEvent = {
        ref: 'refs/heads/main',
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
        pusher: {
          name: 'testuser',
          email: 'test@example.com',
        },
        commits: [
          {
            id: 'abc123',
            message: 'Test commit',
            added: ['file1.ts'],
            removed: ['old_file.ts'],
            modified: ['file2.ts'],
          },
        ],
      };

      const result = await handler.handlePayload('push', pushEvent);

      expect(result.cocapnEvents).toHaveLength(2);

      const taskEvent = result.cocapnEvents.find((e) => e.type === 'task.triggered');
      expect(taskEvent).toBeDefined();
      expect(taskEvent?.payload).toMatchObject({
        source: 'github',
        trigger: 'push',
        repo: 'user/test-repo',
        branch: 'main',
        pusher: 'testuser',
      });

      const reviewEvent = result.cocapnEvents.find((e) => e.type === 'code.review');
      expect(reviewEvent).toBeDefined();
      expect(reviewEvent?.payload).toMatchObject({
        repo: 'user/test-repo',
        branch: 'main',
        commitCount: 1,
      });
    });

    it('should extract branch name from refs', async () => {
      const pushEvent = {
        ref: 'refs/heads/feature/test',
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
        pusher: {
          name: 'testuser',
          email: 'test@example.com',
        },
        commits: [
          {
            id: 'abc123',
            message: 'Test',
            added: [],
            removed: [],
            modified: [],
          },
        ],
      };

      const result = await handler.handlePayload('push', pushEvent);
      const taskEvent = result.cocapnEvents.find((e) => e.type === 'task.triggered');

      expect(taskEvent?.payload).toMatchObject({
        branch: 'feature/test',
      });
    });
  });

  describe('handlePullRequest', () => {
    it('should map opened PR to code.review', async () => {
      const prEvent = {
        action: 'opened',
        pull_request: {
          number: 42,
          title: 'Add new feature',
          body: 'This adds a cool feature',
          html_url: 'https://github.com/user/test-repo/pull/42',
          user: {
            login: 'testuser',
          },
          base: {
            ref: 'main',
            repo: {
              name: 'test-repo',
              full_name: 'user/test-repo',
            },
          },
          head: {
            ref: 'feature/new',
            repo: {
              name: 'test-repo',
              full_name: 'user/test-repo',
            },
          },
        },
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
      };

      const result = await handler.handlePayload('pull_request', prEvent);

      expect(result.cocapnEvents).toHaveLength(1);
      expect(result.cocapnEvents[0].type).toBe('code.review');
      expect(result.cocapnEvents[0].payload).toMatchObject({
        source: 'github',
        action: 'pr_opened',
        repo: 'user/test-repo',
        prNumber: 42,
        title: 'Add new feature',
        author: 'testuser',
      });
    });

    it('should map merged PR to task.completed', async () => {
      const prEvent = {
        action: 'closed',
        pull_request: {
          number: 42,
          title: 'Add new feature',
          body: 'This adds a cool feature',
          html_url: 'https://github.com/user/test-repo/pull/42',
          user: {
            login: 'testuser',
          },
          merged: true,
          base: {
            ref: 'main',
            repo: {
              name: 'test-repo',
              full_name: 'user/test-repo',
            },
          },
          head: {
            ref: 'feature/new',
            repo: {
              name: 'test-repo',
              full_name: 'user/test-repo',
            },
          },
        },
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
      };

      const result = await handler.handlePayload('pull_request', prEvent);

      expect(result.cocapnEvents).toHaveLength(1);
      expect(result.cocapnEvents[0].type).toBe('task.completed');
      expect(result.cocapnEvents[0].payload).toMatchObject({
        source: 'github',
        action: 'pr_merged',
        repo: 'user/test-repo',
        prNumber: 42,
      });
    });

    it('should ignore closed but unmerged PR', async () => {
      const prEvent = {
        action: 'closed',
        pull_request: {
          number: 42,
          title: 'Add new feature',
          body: null,
          html_url: 'https://github.com/user/test-repo/pull/42',
          user: {
            login: 'testuser',
          },
          merged: false,
          base: {
            ref: 'main',
            repo: {
              name: 'test-repo',
              full_name: 'user/test-repo',
            },
          },
          head: {
            ref: 'feature/new',
            repo: {
              name: 'test-repo',
              full_name: 'user/test-repo',
            },
          },
        },
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
      };

      const result = await handler.handlePayload('pull_request', prEvent);

      expect(result.cocapnEvents).toHaveLength(0);
    });

    it('should map reopened PR to task.triggered', async () => {
      const prEvent = {
        action: 'reopened',
        pull_request: {
          number: 42,
          title: 'Add new feature',
          body: null,
          html_url: 'https://github.com/user/test-repo/pull/42',
          user: {
            login: 'testuser',
          },
          merged: false,
          base: {
            ref: 'main',
            repo: {
              name: 'test-repo',
              full_name: 'user/test-repo',
            },
          },
          head: {
            ref: 'feature/new',
            repo: {
              name: 'test-repo',
              full_name: 'user/test-repo',
            },
          },
        },
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
      };

      const result = await handler.handlePayload('pull_request', prEvent);

      expect(result.cocapnEvents).toHaveLength(1);
      expect(result.cocapnEvents[0].type).toBe('task.triggered');
      expect(result.cocapnEvents[0].payload).toMatchObject({
        source: 'github',
        action: 'pr_reopened',
      });
    });
  });

  describe('handleIssues', () => {
    it('should map opened issue to task.triggered', async () => {
      const issueEvent = {
        action: 'opened',
        issue: {
          number: 123,
          title: 'Bug in feature',
          body: 'This is broken',
          html_url: 'https://github.com/user/test-repo/issues/123',
          user: {
            login: 'testuser',
          },
          labels: [
            { name: 'bug' },
            { name: 'high-priority' },
          ],
        },
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
      };

      const result = await handler.handlePayload('issues', issueEvent);

      expect(result.cocapnEvents).toHaveLength(1);
      expect(result.cocapnEvents[0].type).toBe('task.triggered');
      expect(result.cocapnEvents[0].payload).toMatchObject({
        source: 'github',
        action: 'issue_opened',
        repo: 'user/test-repo',
        issueNumber: 123,
        title: 'Bug in feature',
        author: 'testuser',
        labels: ['bug', 'high-priority'],
      });
    });

    it('should map closed issue to task.completed', async () => {
      const issueEvent = {
        action: 'closed',
        issue: {
          number: 123,
          title: 'Bug in feature',
          body: 'This is broken',
          html_url: 'https://github.com/user/test-repo/issues/123',
          user: {
            login: 'testuser',
          },
          labels: [],
        },
        repository: {
          name: 'test-repo',
          full_name: 'user/test-repo',
          html_url: 'https://github.com/user/test-repo',
        },
      };

      const result = await handler.handlePayload('issues', issueEvent);

      expect(result.cocapnEvents).toHaveLength(1);
      expect(result.cocapnEvents[0].type).toBe('task.completed');
      expect(result.cocapnEvents[0].payload).toMatchObject({
        source: 'github',
        action: 'issue_closed',
        issueNumber: 123,
      });
    });
  });

  describe('verifySignature', () => {
    it('should verify SHA256 signature', () => {
      const payload = '{"test":"data"}';
      const secret = 'test-secret';

      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const signature = 'sha256=' + hmac.digest('hex');

      const isValid = GitHubWebhookHandler.verifySignature256(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect SHA256 signature', () => {
      const payload = '{"test":"data"}';
      const secret = 'test-secret';
      const wrongSignature = 'sha256=wrong';

      const isValid = GitHubWebhookHandler.verifySignature256(payload, wrongSignature, secret);
      expect(isValid).toBe(false);
    });

    it('should verify SHA1 signature', () => {
      const payload = '{"test":"data"}';
      const secret = 'test-secret';

      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha1', secret);
      hmac.update(payload);
      const signature = 'sha1=' + hmac.digest('hex');

      const isValid = GitHubWebhookHandler.verifySignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });
  });
});
