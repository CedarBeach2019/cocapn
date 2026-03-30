/**
 * GitHub webhook handler.
 *
 * Parses GitHub webhook payloads and maps them to Cocapn events.
 */

import { createLogger } from '../../logger.js';
import type {
  GitHubPushEvent,
  GitHubPullRequestEvent,
  GitHubIssuesEvent,
} from '../types.js';

const logger = createLogger('webhooks:github');

/**
 * GitHub webhook handler.
 */
export class GitHubWebhookHandler {
  /**
   * Handle a GitHub webhook payload.
   * Returns mapped Cocapn events.
   */
  async handlePayload(eventType: string, payload: unknown): Promise<{
    cocapnEvents: Array<{ type: string; payload: unknown }>;
  }> {
    const cocapnEvents: Array<{ type: string; payload: unknown }> = [];

    try {
      switch (eventType) {
        case 'push':
          const pushEvents = this.handlePush(payload as GitHubPushEvent);
          cocapnEvents.push(...pushEvents);
          break;

        case 'pull_request':
          const prEvents = this.handlePullRequest(payload as GitHubPullRequestEvent);
          cocapnEvents.push(...prEvents);
          break;

        case 'issues':
          const issueEvents = this.handleIssues(payload as GitHubIssuesEvent);
          cocapnEvents.push(...issueEvents);
          break;

        case 'pull_request_review':
          // Handle PR reviews
          cocapnEvents.push({
            type: 'github.pull_request_review',
            payload: this.extractPRReviewData(payload),
          });
          break;

        case 'issue_comment':
          // Handle issue/PR comments
          cocapnEvents.push({
            type: 'github.comment',
            payload: this.extractCommentData(payload),
          });
          break;

        case 'release':
          // Handle releases
          cocapnEvents.push({
            type: 'github.release',
            payload: this.extractReleaseData(payload),
          });
          break;

        default:
          logger.debug('Unhandled GitHub event type', { eventType });
          break;
      }

      logger.info('GitHub webhook processed', {
        eventType,
        cocapnEventCount: cocapnEvents.length,
      });

      return { cocapnEvents };
    } catch (error) {
      logger.error('Failed to process GitHub webhook', error, { eventType });
      return { cocapnEvents: [] };
    }
  }

  /**
   * Handle GitHub push event.
   */
  private handlePush(event: GitHubPushEvent): Array<{ type: string; payload: unknown }> {
    const events: Array<{ type: string; payload: unknown }> = [];

    // Map push to task.triggered for automation
    events.push({
      type: 'task.triggered',
      payload: {
        source: 'github',
        trigger: 'push',
        repo: event.repository.full_name,
        branch: this.extractBranchName(event.ref),
        pusher: event.pusher.name,
        pusherEmail: event.pusher.email,
        commits: event.commits.map((c) => ({
          id: c.id,
          message: c.message,
          added: c.added,
          removed: c.removed,
          modified: c.modified,
        })),
      },
    });

    // If there are commits, trigger code.review event
    if (event.commits.length > 0) {
      events.push({
        type: 'code.review',
        payload: {
          repo: event.repository.full_name,
          branch: this.extractBranchName(event.ref),
          pusher: event.pusher.name,
          filesChanged: this.collectChangedFiles(event),
          commitCount: event.commits.length,
        },
      });
    }

    return events;
  }

  /**
   * Handle GitHub pull request event.
   */
  private handlePullRequest(event: GitHubPullRequestEvent): Array<{ type: string; payload: unknown }> {
    const events: Array<{ type: string; payload: unknown }> = [];

    switch (event.action) {
      case 'opened':
        events.push({
          type: 'code.review',
          payload: {
            source: 'github',
            action: 'pr_opened',
            repo: event.repository.full_name,
            prNumber: event.pull_request.number,
            title: event.pull_request.title,
            body: event.pull_request.body,
            author: event.pull_request.user.login,
            baseBranch: event.pull_request.base.ref,
            headBranch: event.pull_request.head.ref,
            url: event.pull_request.html_url,
          },
        });
        break;

      case 'closed':
        if (event.pull_request.merged) {
          events.push({
            type: 'task.completed',
            payload: {
              source: 'github',
              action: 'pr_merged',
              repo: event.repository.full_name,
              prNumber: event.pull_request.number,
              title: event.pull_request.title,
              mergeAuthor: event.pull_request.user.login,
              url: event.pull_request.html_url,
            },
          });
        }
        break;

      case 'reopened':
        events.push({
          type: 'task.triggered',
          payload: {
            source: 'github',
            action: 'pr_reopened',
            repo: event.repository.full_name,
            prNumber: event.pull_request.number,
            title: event.pull_request.title,
            url: event.pull_request.html_url,
          },
        });
        break;

      default:
        // Log other PR actions but don't trigger events
        logger.debug('PR action not mapped to event', { action: event.action });
        break;
    }

    return events;
  }

  /**
   * Handle GitHub issues event.
   */
  private handleIssues(event: GitHubIssuesEvent): Array<{ type: string; payload: unknown }> {
    const events: Array<{ type: string; payload: unknown }> = [];

    switch (event.action) {
      case 'opened':
        events.push({
          type: 'task.triggered',
          payload: {
            source: 'github',
            action: 'issue_opened',
            repo: event.repository.full_name,
            issueNumber: event.issue.number,
            title: event.issue.title,
            body: event.issue.body,
            author: event.issue.user.login,
            labels: event.issue.labels.map((l) => l.name),
            url: event.issue.html_url,
          },
        });
        break;

      case 'closed':
        events.push({
          type: 'task.completed',
          payload: {
            source: 'github',
            action: 'issue_closed',
            repo: event.repository.full_name,
            issueNumber: event.issue.number,
            title: event.issue.title,
            closer: event.issue.user.login,
            url: event.issue.html_url,
          },
        });
        break;

      case 'reopened':
        events.push({
          type: 'task.triggered',
          payload: {
            source: 'github',
            action: 'issue_reopened',
            repo: event.repository.full_name,
            issueNumber: event.issue.number,
            title: event.issue.title,
            url: event.issue.html_url,
          },
        });
        break;

      default:
        logger.debug('Issue action not mapped to event', { action: event.action });
        break;
    }

    return events;
  }

  /**
   * Extract PR review data from payload.
   */
  private extractPRReviewData(payload: any): Record<string, unknown> {
    return {
      repo: payload.repository?.full_name,
      prNumber: payload.pull_request?.number,
      reviewState: payload.review?.state,
      reviewAuthor: payload.review?.user?.login,
      reviewBody: payload.review?.body,
      url: payload.review?.html_url,
    };
  }

  /**
   * Extract comment data from payload.
   */
  private extractCommentData(payload: any): Record<string, unknown> {
    return {
      repo: payload.repository?.full_name,
      commentAuthor: payload.comment?.user?.login,
      commentBody: payload.comment?.body,
      issueNumber: payload.issue?.number,
      prNumber: payload.pull_request?.number,
      url: payload.comment?.html_url,
    };
  }

  /**
   * Extract release data from payload.
   */
  private extractReleaseData(payload: any): Record<string, unknown> {
    return {
      repo: payload.repository?.full_name,
      tagName: payload.release?.tag_name,
      releaseName: payload.release?.name,
      releaseAuthor: payload.release?.author?.login,
      releaseBody: payload.release?.body,
      prerelease: payload.release?.prerelease,
      url: payload.release?.html_url,
    };
  }

  /**
   * Extract branch name from git ref.
   */
  private extractBranchName(ref: string): string {
    // refs/heads/main -> main
    // refs/heads/feature/test -> feature/test
    // refs/tags/v1.0.0 -> v1.0.0
    if (ref.startsWith('refs/heads/')) {
      return ref.substring(11); // Remove 'refs/heads/'
    }
    if (ref.startsWith('refs/tags/')) {
      return ref.substring(10); // Remove 'refs/tags/'
    }
    return ref;
  }

  /**
   * Collect all changed files from a push event.
   */
  private collectChangedFiles(event: GitHubPushEvent): string[] {
    const files = new Set<string>();

    for (const commit of event.commits) {
      commit.added.forEach((f) => files.add(f));
      commit.removed.forEach((f) => files.add(f));
      commit.modified.forEach((f) => files.add(f));
    }

    return Array.from(files);
  }

  /**
   * Verify GitHub webhook signature.
   * GitHub uses HMAC-SHA1 with X-Hub-Signature.
   */
  static verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha1', secret);
    hmac.update(payload);
    const expected = 'sha1=' + hmac.digest('hex');
    return signature === expected;
  }

  /**
   * Verify GitHub webhook signature (SHA256).
   * GitHub uses HMAC-SHA256 with X-Hub-Signature-256.
   */
  static verifySignature256(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expected = 'sha256=' + hmac.digest('hex');
    return signature === expected;
  }
}
