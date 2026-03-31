/**
 * Git Summary plugin — /summary
 * Shows repo summary: files changed this week, active branches, contributor breakdown.
 */

import { execSync } from 'node:child_process';

export default {
  name: 'git-summary',
  version: '1.0.0',
  hooks: {
    command: {
      async summary(_args) {
        try {
          const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', timeout: 5000 }).trim();
          const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
          const changedRaw = execSync(`git diff --name-only HEAD@{${weekAgo}}..HEAD 2>/dev/null || git diff --name-only HEAD~20..HEAD`, { encoding: 'utf-8', timeout: 5000 }).trim();
          const changed = changedRaw ? changedRaw.split('\n').filter(Boolean) : [];
          const branches = execSync('git branch --list', { encoding: 'utf-8', timeout: 5000 }).trim().split('\n').map(b => b.replace(/^\*?\s+/, '')).filter(Boolean);
          const shortlog = execSync('git shortlog -sn HEAD~50..HEAD 2>/dev/null || git shortlog -sn', { encoding: 'utf-8', timeout: 5000 }).trim();
          const totalCommits = execSync('git rev-list --count HEAD', { encoding: 'utf-8', timeout: 5000 }).trim();
          const lines = [
            `Branch: ${branch} (${branches.length} branches)`,
            `Total commits: ${totalCommits}`,
            `Files changed this week: ${changed.length}${changed.length > 0 ? '\n  ' + changed.slice(0, 15).join('\n  ') : ''}`,
            `Contributors:\n${shortlog.split('\n').map(l => '  ' + l).join('\n')}`,
          ];
          return lines.join('\n');
        } catch (e) {
          return `Failed to generate summary: ${String(e)}`;
        }
      },
    },
  },
};
