/**
 * DiscoveryWidget — sidebar search for discovering cocapn users.
 *
 * - Search by username@domain format
 * - Quick results from public repos
 * - Shows avatar, username, domain, and brief preview
 * - Click to view profile modal
 * - Follow button integration
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { Avatar } from "./ProfileModal.js";
import type { FollowedUser } from "@/types/activity.js";

// ─── Search result types ─────────────────────────────────────────────────────────

export interface DiscoveryResult extends FollowedUser {
  bio?: string;
  focus?: string;
  updateCount?: number;
}

// ─── Props ───────────────────────────────────────────────────────────────────────

interface DiscoveryWidgetProps {
  onFollow: (username: string, domain: string) => void;
  onProfileClick: (user: FollowedUser) => void;
  followingUsers: FollowedUser[];
  className?: string;
}

// ─── Input validation ────────────────────────────────────────────────────────────

function parseUserInput(input: string): { username: string; domain: string } | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^@?([^@]+)@(.+)$/);
  if (!match) return null;

  const [, username, domain] = match;
  if (!username || !domain) return null;

  return { username, domain };
}

function isValidInput(input: string): boolean {
  return parseUserInput(input) !== null;
}

// ─── Debounce hook ───────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// ─── Result item component ───────────────────────────────────────────────────────

interface ResultItemProps {
  result: DiscoveryResult;
  isFollowing: boolean;
  onFollow: (username: string, domain: string) => void;
  onProfileClick: (user: FollowedUser) => void;
}

function ResultItem({ result, isFollowing, onFollow, onProfileClick }: ResultItemProps) {
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-skin hover:bg-surface-2 transition-colors cursor-pointer group"
      onClick={() => onProfileClick(result)}
    >
      <Avatar username={result.username} domain={result.domain} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">
          {result.username}@{result.domain}
        </p>
        {result.focus && (
          <p className="text-xs text-text-muted truncate">{result.focus}</p>
        )}
        {result.updateCount !== undefined && (
          <p className="text-xs text-text-muted">
            {result.updateCount} update{result.updateCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onFollow(result.username, result.domain);
        }}
        disabled={isFollowing}
        className={[
          "text-xs px-2 py-1 rounded border transition-colors shrink-0",
          isFollowing
            ? "border-border text-text-muted cursor-default"
            : "border-primary/40 text-primary hover:bg-primary/10",
        ].join(" ")}
      >
        {isFollowing ? "Following" : "Follow"}
      </button>
    </div>
  );
}

// ─── Loading skeleton ───────────────────────────────────────────────────────────

function ResultSkeleton() {
  return (
    <div className="flex items-center gap-3 p-2">
      <div className="w-8 h-8 rounded-full bg-surface-2 animate-pulse" />
      <div className="flex-1">
        <div className="h-3 bg-surface-2 rounded w-24 animate-pulse mb-1" />
        <div className="h-2 bg-surface-2 rounded w-16 animate-pulse" />
      </div>
    </div>
  );
}

// ─── Empty states ───────────────────────────────────────────────────────────────

function EmptyState({ type }: { type: "no-query" | "no-results" | "invalid" }) {
  const states = {
    "no-query": {
      icon: "🔍",
      title: "Discover users",
      message: 'Search by "username@domain" to find cocapn users.',
    },
    "no-results": {
      icon: "🤷",
      title: "No results found",
      message: "Try a different username or domain.",
    },
    "invalid": {
      icon: "⚠️",
      title: "Invalid format",
      message: 'Use "username@domain" format (e.g., "alice@personallog.ai").',
    },
  };

  const { icon, title, message } = states[type];

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-text-muted">
      <span className="text-2xl opacity-50">{icon}</span>
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="text-xs text-center max-w-xs">{message}</p>
    </div>
  );
}

// ─── DiscoveryWidget ─────────────────────────────────────────────────────────────

export function DiscoveryWidget({
  onFollow,
  onProfileClick,
  followingUsers,
  className = "",
}: DiscoveryWidgetProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const debouncedQuery = useDebounce(query, 300);
  const searchRef = useRef<string | null>(null);

  // Check if a user is being followed
  const isFollowing = useCallback(
    (username: string, domain: string) => {
      return followingUsers.some(
        (u) => u.username === username && u.domain === domain
      );
    },
    [followingUsers]
  );

  // Search for users
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 3) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    const parsed = parseUserInput(debouncedQuery);
    if (!parsed) {
      setHasSearched(true);
      setResults([]);
      return;
    }

    const { username, domain } = parsed;
    const currentSearch = `${username}@${domain}`;

    // Avoid duplicate searches
    if (searchRef.current === currentSearch) return;
    searchRef.current = currentSearch;

    const searchUsers = async () => {
      setLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        // Try to fetch profile from public repo
        const profileUrl = `https://${domain}/${username}/profile.json`;
        const updatesUrl = `https://${domain}/${username}/updates/index.json`;

        const [profileRes, updatesRes] = await Promise.allSettled([
          fetch(profileUrl),
          fetch(updatesUrl),
        ]);

        let bio: string | undefined;
        let focus: string | undefined;
        let updateCount = 0;

        // Parse profile data
        if (profileRes.status === "fulfilled" && profileRes.value.ok) {
          try {
            const data = await profileRes.value.json();
            bio = data.bio;
            focus = data.focus;
          } catch {
            // Invalid JSON, ignore
          }
        }

        // Parse updates count
        if (updatesRes.status === "fulfilled" && updatesRes.value.ok) {
          try {
            const data = await updatesRes.value.json();
            updateCount = data.entries?.length ?? 0;
          } catch {
            // Invalid JSON, ignore
          }
        }

        // Only show result if we found something (profile or updates)
        if (bio || focus || updateCount > 0) {
          const result: DiscoveryResult = {
            username,
            domain,
            profileUrl: `https://${domain}/${username}`,
            updatesUrl: `https://${domain}/${username}/updates/index.json`,
            lastSeen: null,
            bio,
            focus,
            updateCount,
          };
          setResults([result]);
        } else {
          setResults([]);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    void searchUsers();
  }, [debouncedQuery]);

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setError(null);
  }, []);

  // Handle follow
  const handleFollow = useCallback(
    (username: string, domain: string) => {
      onFollow(username, domain);
    },
    [onFollow]
  );

  // Handle profile click
  const handleProfileClick = useCallback(
    (user: FollowedUser) => {
      onProfileClick(user);
    },
    [onProfileClick]
  );

  // Determine which empty state to show
  const getEmptyState = (): "no-query" | "no-results" | "invalid" => {
    if (!hasSearched) return "no-query";
    if (!isValidInput(debouncedQuery)) return "invalid";
    return "no-results";
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="username@domain"
          className={[
            "w-full px-3 py-2 text-sm bg-surface border border-border rounded-skin",
            "text-text placeholder:text-text-muted",
            "focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60",
            "transition-colors",
          ].join(" ")}
          aria-label="Search for users"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex flex-col gap-2 py-2">
            <ResultSkeleton />
            <ResultSkeleton />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-xs text-danger">{error}</p>
          </div>
        ) : results.length > 0 ? (
          <div className="flex flex-col gap-1 py-2">
            {results.map((result) => (
              <ResultItem
                key={`${result.username}@${result.domain}`}
                result={result}
                isFollowing={isFollowing(result.username, result.domain)}
                onFollow={handleFollow}
                onProfileClick={handleProfileClick}
              />
            ))}
          </div>
        ) : (
          <EmptyState type={getEmptyState()} />
        )}
      </div>
    </div>
  );
}
