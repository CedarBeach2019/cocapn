/**
 * FollowButton — prompts for username@domain and follows the user.
 *
 * - Opens a dialog when clicked
 * - Validates username@domain format
 * - Shows follow/unfollow state
 * - Integrates with useActivityFeed
 */

import { useState, useCallback, useRef, useEffect } from "react";

// ─── Props ───────────────────────────────────────────────────────────────────────

interface FollowButtonProps {
  onFollow: (username: string, domain: string) => void;
  followingCount?: number;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
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

// ─── Follow dialog ───────────────────────────────────────────────────────────────

interface FollowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onFollow: (username: string, domain: string) => void;
}

function FollowDialog({ isOpen, onClose, onFollow }: FollowDialogProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (isOpen) {
      setInput("");
      setError("");
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Handle submit
  const handleSubmit = useCallback(() => {
    const parsed = parseUserInput(input);
    if (!parsed) {
      setError('Invalid format. Use "username@domain" (e.g., "alice@personallog.ai")');
      return;
    }

    onFollow(parsed.username, parsed.domain);
    onClose();
  }, [input, onFollow, onClose]);

  // Handle keydown
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleSubmit, onClose]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-dialog-title"
    >
      <div
        className="bg-surface border border-border rounded-skin max-w-sm w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <h3 id="follow-dialog-title" className="text-sm font-semibold text-text mb-3">
          Follow a user
        </h3>

        {/* Input */}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            onKeyDown={handleKeyDown}
            placeholder="username@domain"
            className={[
              "w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-skin",
              "text-text placeholder:text-text-muted",
              "focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60",
              "transition-colors",
              error ? "border-danger" : "",
            ].join(" ")}
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? "follow-error" : undefined}
          />

          {/* Error message */}
          {error && (
            <p id="follow-error" className="text-xs text-danger">
              {error}
            </p>
          )}

          {/* Help text */}
          {!error && (
            <p className="text-xs text-text-muted">
              Enter a username and domain to follow their public updates.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-skin border border-border text-text-muted hover:text-text hover:border-border/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="text-xs px-3 py-1.5 rounded-skin bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Follow
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Button styles ───────────────────────────────────────────────────────────────

function buttonClasses(variant: FollowButtonProps["variant"], size: FollowButtonProps["size"]): string {
  const base = [
    "inline-flex items-center gap-1.5 font-medium transition-colors",
    "disabled:opacity-40 disabled:cursor-not-allowed",
  ];

  const variants = {
    primary: [
      "bg-primary text-white hover:bg-primary/90",
      "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-bg",
    ],
    secondary: [
      "bg-surface-2 text-text border border-border",
      "hover:bg-surface-3 hover:border-border/80",
    ],
    ghost: [
      "text-text-muted hover:text-text hover:bg-surface-2",
    ],
  };

  const sizes = {
    sm: "text-xs px-2 py-1 rounded",
    md: "text-sm px-3 py-1.5 rounded-skin",
  };

  return [...base, ...variants[variant ?? "secondary"], ...sizes[size ?? "md"]].join(" ");
}

// ─── FollowButton ────────────────────────────────────────────────────────────────

export function FollowButton({
  onFollow,
  followingCount = 0,
  variant = "secondary",
  size = "md",
  className = "",
}: FollowButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleFollow = useCallback(
    (username: string, domain: string) => {
      onFollow(username, domain);
    },
    [onFollow]
  );

  return (
    <>
      <button
        onClick={handleClick}
        className={buttonClasses(variant, size) + " " + className}
        aria-label="Follow a user"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Follow
        {followingCount > 0 && (
          <span className="text-text-muted/60">({followingCount})</span>
        )}
      </button>

      <FollowDialog
        isOpen={dialogOpen}
        onClose={handleClose}
        onFollow={handleFollow}
      />
    </>
  );
}
