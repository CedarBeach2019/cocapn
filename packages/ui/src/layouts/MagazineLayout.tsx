/**
 * MagazineLayout — masonry grid of daily update cards with social features.
 *
 * Data flows in from the parent (App or the updates panel hook).
 * Each card shows: date, streak badge, summary, tag chips, accomplishments.
 * A "Live" indicator appears in the toolbar when the bridge is connected.
 *
 * Social features:
 * - Sidebar with DiscoveryWidget for finding users
 * - Tab system to switch between "My Updates" and "Following"
 * - Activity feed from followed users
 * - Profile modal for viewing user details
 *
 * Layout: CSS multi-column (no external masonry lib needed).
 *   - mobile:  1 column
 *   - sm:      2 columns
 *   - lg:      3 columns
 */

import { useState, useCallback } from "react";
import { useBridgeContext } from "@/contexts/BridgeContext.js";
import { StreakBadge } from "@/components/StreakBadge.js";
import { ProfileModal } from "@/components/ProfileModal.js";
import { DiscoveryWidget } from "@/components/DiscoveryWidget.js";
import { FollowButton } from "@/components/FollowButton.js";
import { ActivityFeedCard } from "@/components/ActivityFeedCard.js";
import { useActivityFeed } from "@/hooks/useActivityFeed.js";
import type { UpdateEntry } from "@/types/updates.js";
import type { FollowedUser } from "@/types/activity.js";

// ─── Live indicator ───────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="flex items-center gap-1.5 text-xs text-success">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
      </span>
      Live
    </span>
  );
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-text-muted border border-border">
      {tag}
    </span>
  );
}

// ─── Update card ─────────────────────────────────────────────────────────────

interface UpdateCardProps {
  entry: UpdateEntry;
}

function UpdateCard({ entry }: UpdateCardProps) {
  const { date, streak, tags, summary, accomplishments } = entry;

  // Format date as "Mar 28, 2026"
  const displayDate = (() => {
    try {
      return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day:   "numeric",
        year:  "numeric",
      });
    } catch {
      return date;
    }
  })();

  return (
    <article className="bg-surface border border-border rounded-skin p-4 flex flex-col gap-3">
      {/* Date + streak */}
      <div className="flex items-center justify-between gap-2">
        <time
          dateTime={date}
          className="text-xs font-mono text-text-muted"
        >
          {displayDate}
        </time>
        {streak > 0 && <StreakBadge streak={streak} />}
      </div>

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
    </article>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ error }: { error: string | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
      <div className="text-4xl opacity-20">📰</div>
      {error ? (
        <>
          <p className="text-sm font-semibold text-text">No updates found</p>
          <p className="text-xs text-center max-w-xs">
            The public repo doesn't have an <code className="font-mono text-primary">updates/index.json</code> yet.
            Enable the <strong>auto-publisher</strong> module to start generating daily updates.
          </p>
        </>
      ) : (
        <p className="text-sm">No updates yet — keep shipping!</p>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={[
            "break-inside-avoid mb-4",
            "bg-surface border border-border rounded-skin p-4",
            "animate-pulse",
          ].join(" ")}
          style={{ height: 100 + (i % 3) * 40 }}
        />
      ))}
    </div>
  );
}

// ─── Tab types ─────────────────────────────────────────────────────────────────

type FeedTab = "my-updates" | "following";

// ─── Toolbar ─────────────────────────────────────────────────────────────────

interface ToolbarProps {
  activeTab: FeedTab;
  tabCount: { "my-updates": number; following: number };
  loading: boolean;
  onRefresh: () => void;
  onTabChange: (tab: FeedTab) => void;
}

function Toolbar({ activeTab, tabCount, loading, onRefresh, onTabChange }: ToolbarProps) {
  const bridge = useBridgeContext();

  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface shrink-0">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-surface-2 rounded-skin p-0.5">
        <button
          onClick={() => onTabChange("my-updates")}
          className={[
            "px-3 py-1 text-xs font-medium rounded transition-colors",
            activeTab === "my-updates"
              ? "text-text bg-surface shadow-sm"
              : "text-text-muted hover:text-text",
          ].join(" ")}
        >
          My Updates
          {tabCount["my-updates"] > 0 && (
            <span className="ml-1 text-text-muted/60">({tabCount["my-updates"]})</span>
          )}
        </button>
        <button
          onClick={() => onTabChange("following")}
          className={[
            "px-3 py-1 text-xs font-medium rounded transition-colors",
            activeTab === "following"
              ? "text-text bg-surface shadow-sm"
              : "text-text-muted hover:text-text",
          ].join(" ")}
        >
          Following
          {tabCount.following > 0 && (
            <span className="ml-1 text-text-muted/60">({tabCount.following})</span>
          )}
        </button>
      </div>

      <div className="flex-1" />
      {bridge.status === "connected" && <LiveDot />}
      <button
        onClick={onRefresh}
        disabled={loading}
        className={[
          "text-xs px-3 py-1 rounded-skin border border-border",
          "text-text-muted hover:text-text hover:border-border/80 transition-colors",
          "disabled:opacity-40",
        ].join(" ")}
        aria-label="Refresh updates"
      >
        {loading ? "Loading…" : "Refresh"}
      </button>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  followingUsers: FollowedUser[];
  onFollow: (username: string, domain: string) => void;
  onProfileClick: (user: FollowedUser) => void;
}

function Sidebar({ followingUsers, onFollow, onProfileClick }: SidebarProps) {
  return (
    <aside className="w-64 border-r border-border flex-col hidden lg:flex shrink-0 overflow-hidden bg-surface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-text">Discover</h3>
        <p className="text-xs text-text-muted mt-0.5">
          Find and follow cocapn users
        </p>
      </div>

      {/* Discovery widget */}
      <div className="flex-1 overflow-y-auto p-4">
        <DiscoveryWidget
          onFollow={onFollow}
          onProfileClick={onProfileClick}
          followingUsers={followingUsers}
        />
      </div>
    </aside>
  );
}

// ─── Activity feed section ─────────────────────────────────────────────────────

interface ActivityFeedProps {
  activities: import("@/types/activity.js").ActivityItem[];
  loading: boolean;
  onUserClick: (username: string, domain: string) => void;
}

function ActivityFeed({ activities, loading, onUserClick }: ActivityFeedProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={[
              "bg-surface border border-border rounded-skin p-4",
              "animate-pulse",
            ].join(" ")}
            style={{ height: 140 + (i % 3) * 40 }}
          />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
        <div className="text-4xl opacity-20">👥</div>
        <p className="text-sm font-semibold text-text">No activity yet</p>
        <p className="text-xs text-center max-w-xs">
          Follow users to see their public updates here. Use the sidebar to discover new people.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {activities.map((activity) => (
        <ActivityFeedCard
          key={activity.id}
          activity={activity}
          onUserClick={onUserClick}
        />
      ))}
    </div>
  );
}

// ─── MagazineLayout ───────────────────────────────────────────────────────────

export interface MagazineLayoutProps {
  entries: UpdateEntry[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
}

export function MagazineLayout({
  entries,
  loading = false,
  error = null,
  onRefresh,
  className = "",
}: MagazineLayoutProps) {
  // Activity feed state
  const {
    followedUsers,
    activities,
    loading: activityLoading,
    follow,
    unfollow,
    refresh: refreshActivities,
  } = useActivityFeed();

  // Tab state
  const [activeTab, setActiveTab] = useState<FeedTab>("my-updates");

  // Profile modal state
  const [profileUser, setProfileUser] = useState<FollowedUser | null>(null);

  // Handle tab change
  const handleTabChange = useCallback((tab: FeedTab) => {
    setActiveTab(tab);
    if (tab === "following") {
      refreshActivities();
    }
  }, [refreshActivities]);

  // Handle follow
  const handleFollow = useCallback(
    (username: string, domain: string) => {
      follow(username, domain);
    },
    [follow]
  );

  // Handle profile click
  const handleProfileClick = useCallback((user: FollowedUser) => {
    setProfileUser(user);
  }, []);

  // Handle user click from activity card
  const handleUserClick = useCallback(
    (username: string, domain: string) => {
      const user = followedUsers.find(
        (u) => u.username === username && u.domain === domain
      );
      if (user) {
        setProfileUser(user);
      }
    },
    [followedUsers]
  );

  // Handle refresh
  const handleRefresh = useCallback(() => {
    if (activeTab === "following") {
      refreshActivities();
    }
    onRefresh?.();
  }, [activeTab, refreshActivities, onRefresh]);

  // Tab counts
  const tabCount = {
    "my-updates": entries.length,
    following: activities.length,
  };

  return (
    <div className={`flex flex-col h-full overflow-hidden bg-bg ${className}`}>
      {/* Toolbar with tabs */}
      <Toolbar
        activeTab={activeTab}
        tabCount={tabCount}
        loading={loading || activityLoading}
        onRefresh={handleRefresh}
        onTabChange={handleTabChange}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          followingUsers={followedUsers}
          onFollow={handleFollow}
          onProfileClick={handleProfileClick}
        />

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
            {activeTab === "my-updates" ? (
              <>
                {loading && entries.length === 0 ? (
                  <Skeleton />
                ) : entries.length === 0 ? (
                  <EmptyState error={error} />
                ) : (
                  <div className="columns-1 sm:columns-2 xl:columns-3 gap-4">
                    {entries.map((entry) => (
                      <div key={entry.date} className="break-inside-avoid mb-4">
                        <UpdateCard entry={entry} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <ActivityFeed
                activities={activities}
                loading={activityLoading}
                onUserClick={handleUserClick}
              />
            )}
          </div>
        </div>
      </div>

      {/* Profile modal */}
      {profileUser && (
        <ProfileModal
          user={profileUser}
          isOpen={profileUser !== null}
          onClose={() => setProfileUser(null)}
        />
      )}
    </div>
  );
}
