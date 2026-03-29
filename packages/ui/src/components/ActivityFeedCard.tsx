/**
 * ActivityFeedCard — displays an activity item from a followed user.
 *
 * Shows:
 * - User avatar and name (clickable to view profile)
 * - Activity type indicator
 * - Timestamp
 * - Activity content (summary, accomplishments, tags)
 * - Hover effects for interactivity
 */

import { Avatar } from "./ProfileModal.js";
import type { ActivityItem } from "@/types/activity.js";

// ─── Props ───────────────────────────────────────────────────────────────────────

interface ActivityFeedCardProps {
  activity: ActivityItem;
  onUserClick: (username: string, domain: string) => void;
}

// ─── Type badge ─────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ActivityItem["type"] }) {
  const config: Record<ActivityItem["type"], { icon: string; label: string; color: string }> = {
    update: {
      icon: "📝",
      label: "Update",
      color: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    },
    profile: {
      icon: "👤",
      label: "Profile",
      color: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    },
    module: {
      icon: "🧩",
      label: "Module",
      color: "bg-green-500/10 text-green-500 border-green-500/20",
    },
  };

  const { icon, label, color } = config[type];

  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border",
        color,
      ].join(" ")}
      title={label}
    >
      {icon}
      {label}
    </span>
  );
}

// ─── Tag chip ───────────────────────────────────────────────────────────────────

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-text-muted border border-border">
      {tag}
    </span>
  );
}

// ─── Update content display ─────────────────────────────────────────────────────

interface UpdateContentDisplayProps {
  summary: string;
  accomplishments: string[];
  tags: string[];
}

function UpdateContentDisplay({ summary, accomplishments, tags }: UpdateContentDisplayProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Summary */}
      <p className="text-sm text-text leading-relaxed">{summary}</p>

      {/* Accomplishments */}
      {accomplishments.length > 0 && (
        <ul className="flex flex-col gap-1">
          {accomplishments.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-text-muted"
            >
              <span className="text-primary mt-0.5 shrink-0">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
          {tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profile content display ────────────────────────────────────────────────────

interface ProfileContentDisplayProps {
  change: string;
  previous?: string;
}

function ProfileContentDisplay({ change, previous }: ProfileContentDisplayProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm text-text">{change}</p>
      {previous && (
        <p className="text-xs text-text-muted">
          Was: {previous}
        </p>
      )}
    </div>
  );
}

// ─── Module content display ─────────────────────────────────────────────────────

interface ModuleContentDisplayProps {
  module: string;
  action: "install" | "uninstall";
}

function ModuleContentDisplay({ module, action }: ModuleContentDisplayProps) {
  const actionConfig = {
    install: { icon: "➕", label: "Installed" },
    uninstall: { icon: "➖", label: "Uninstalled" },
  };

  const { icon, label } = actionConfig[action];

  return (
    <div className="flex items-center gap-2">
      <span>{icon}</span>
      <span className="text-sm text-text">
        {label} <span className="font-mono text-primary">{module}</span>
      </span>
    </div>
  );
}

// ─── ActivityFeedCard ───────────────────────────────────────────────────────────

export function ActivityFeedCard({ activity, onUserClick }: ActivityFeedCardProps) {
  const { id, type, user, timestamp, content } = activity;

  // Format timestamp
  const displayTimestamp = (() => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return timestamp;
    }
  })();

  // Render content based on type
  const renderContent = () => {
    switch (content.type) {
      case "update":
        return (
          <UpdateContentDisplay
            summary={content.summary}
            accomplishments={content.accomplishments}
            tags={content.tags}
          />
        );
      case "profile":
        return (
          <ProfileContentDisplay
            change={content.change}
            previous={content.previous}
          />
        );
      case "module":
        return (
          <ModuleContentDisplay
            module={content.module}
            action={content.action}
          />
        );
      default:
        return null;
    }
  };

  return (
    <article className="bg-surface border border-border rounded-skin p-4 flex flex-col gap-3 hover:border-border/80 transition-colors">
      {/* Header: user info and timestamp */}
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => onUserClick(user.username, user.domain)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Avatar username={user.username} domain={user.domain} size="sm" />
          <span className="text-sm font-medium text-text">
            {user.username}@{user.domain}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <TypeBadge type={type} />
          <time
            dateTime={timestamp}
            className="text-xs text-text-muted font-mono"
          >
            {displayTimestamp}
          </time>
        </div>
      </div>

      {/* Content */}
      {renderContent()}
    </article>
  );
}
