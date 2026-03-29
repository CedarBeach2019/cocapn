/**
 * ProfileModal — displays full user profile with bio, focus, streak, and recent updates.
 *
 * Opens when clicking on a user avatar. Shows:
 * - User avatar (initials with colored background)
 * - Username and domain
 * - Bio (if available)
 * - Focus area (if available)
 * - Current streak
 * - Recent updates from their public repo
 */

import { useState, useEffect } from "react";
import type { FollowedUser, ActivityItem } from "@/types/activity.js";

// ─── Profile types ───────────────────────────────────────────────────────────────

export interface UserProfile extends FollowedUser {
  bio?: string;
  focus?: string;
  streak?: number;
  recentUpdates?: ActivityItem[];
}

// ─── Props ───────────────────────────────────────────────────────────────────────

interface ProfileModalProps {
  user: FollowedUser;
  isOpen: boolean;
  onClose: () => void;
}

// ─── Avatar component ────────────────────────────────────────────────────────────

interface AvatarProps {
  username: string;
  domain: string;
  size?: "sm" | "md" | "lg";
}

function avatarColor(username: string): string {
  const colors = [
    "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500",
    "bg-lime-500", "bg-green-500", "bg-emerald-500", "bg-teal-500",
    "bg-cyan-500", "bg-sky-500", "bg-blue-500", "bg-indigo-500",
    "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function sizeClasses(size: AvatarProps["size"]): string {
  switch (size) {
    case "sm": return "w-8 h-8 text-sm";
    case "lg": return "w-20 h-20 text-2xl";
    case "md": default: return "w-12 h-12 text-lg";
  }
}

export function Avatar({ username, domain, size = "md" }: AvatarProps) {
  const initial = username.charAt(0).toUpperCase();
  const bgColor = avatarColor(username);

  return (
    <div
      className={[
        "rounded-full flex items-center justify-center text-white font-semibold",
        bgColor,
        sizeClasses(size),
      ].join(" ")}
      title={`${username}@${domain}`}
    >
      {initial}
    </div>
  );
}

// ─── Activity item component ─────────────────────────────────────────────────────

interface ActivityRowProps {
  activity: ActivityItem;
}

function ActivityRow({ activity }: ActivityRowProps) {
  const { timestamp, content } = activity;
  const displayDate = (() => {
    try {
      return new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return timestamp;
    }
  })();

  if (content.type !== "update") return null;

  return (
    <div className="py-2 border-b border-border last:border-0">
      <div className="flex items-start gap-2">
        <span className="text-xs text-text-muted font-mono shrink-0">
          {displayDate}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text truncate">{content.summary}</p>
          {content.accomplishments.length > 0 && (
            <p className="text-xs text-text-muted mt-0.5">
              {content.accomplishments.length} accomplishment{content.accomplishments.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="w-20 h-20 rounded-full bg-surface-2 animate-pulse" />
      <div className="h-6 bg-surface-2 rounded w-1/2 animate-pulse" />
      <div className="h-4 bg-surface-2 rounded w-full animate-pulse" />
      <div className="h-4 bg-surface-2 rounded w-3/4 animate-pulse" />
      <div className="space-y-2">
        <div className="h-3 bg-surface-2 rounded animate-pulse" />
        <div className="h-3 bg-surface-2 rounded animate-pulse" />
        <div className="h-3 bg-surface-2 rounded animate-pulse" />
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────────

function EmptyProfile({ user }: { user: FollowedUser }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3 text-text-muted">
      <Avatar username={user.username} domain={user.domain} size="lg" />
      <p className="text-sm font-semibold text-text">
        {user.username}@{user.domain}
      </p>
      <p className="text-xs text-center max-w-xs">
        No profile information available yet.
      </p>
    </div>
  );
}

// ─── ProfileModal ───────────────────────────────────────────────────────────────

export function ProfileModal({ user, isOpen, onClose }: ProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile data when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        // Try to fetch profile.json from user's public repo
        const profileUrl = `${user.profileUrl}/profile.json`;
        const response = await fetch(profileUrl);

        if (response.ok) {
          const data = await response.json();
          setProfile({ ...user, ...data });
        } else {
          // Profile not found, use basic user data
          setProfile(user);
        }
      } catch (err) {
        // Network error, use basic user data
        setProfile(user);
      } finally {
        setLoading(false);
      }
    };

    void fetchProfile();
  }, [isOpen, user]);

  // Handle escape key and backdrop click
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
    >
      <div
        className="bg-surface border border-border rounded-skin max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 id="profile-title" className="text-sm font-semibold text-text">
            Profile
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text transition-colors p-1 rounded hover:bg-surface-2"
            aria-label="Close"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <ProfileSkeleton />
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-danger">{error}</p>
            </div>
          ) : profile ? (
            <div className="flex flex-col gap-4">
              {/* Avatar and basic info */}
              <div className="flex items-start gap-4">
                <Avatar username={profile.username} domain={profile.domain} size="lg" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-text break-words">
                    {profile.username}@{profile.domain}
                  </h3>
                  {profile.focus && (
                    <p className="text-sm text-text-muted mt-0.5">{profile.focus}</p>
                  )}
                  {profile.streak !== undefined && profile.streak > 0 && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                        🔥 {profile.streak} day streak
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Bio */}
              {profile.bio && (
                <div className="pt-2 border-t border-border">
                  <p className="text-sm text-text leading-relaxed">{profile.bio}</p>
                </div>
              )}

              {/* Recent updates */}
              {profile.recentUpdates && profile.recentUpdates.length > 0 ? (
                <div className="pt-2 border-t border-border">
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Recent Updates
                  </h4>
                  <div className="flex flex-col">
                    {profile.recentUpdates.slice(0, 5).map((activity) => (
                      <ActivityRow key={activity.id} activity={activity} />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-text-muted">
                    No recent updates yet.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <EmptyProfile user={user} />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-surface-2">
          <a
            href={user.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-sm text-primary hover:text-primary/80 transition-colors"
          >
            View full profile
          </a>
        </div>
      </div>
    </div>
  );
}
