/**
 * Tests for social components: ProfileModal, DiscoveryWidget, FollowButton, ActivityFeedCard
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ProfileModal } from "./ProfileModal.js";
import { DiscoveryWidget } from "./DiscoveryWidget.js";
import { FollowButton } from "./FollowButton.js";
import { ActivityFeedCard } from "./ActivityFeedCard.js";
import type { FollowedUser, ActivityItem } from "@/types/activity.js";

// ─── Mock server setup ───────────────────────────────────────────────────────────

const mockServer = setupServer(
  http.get("https://example.com/alice/profile.json", () => {
    return HttpResponse.json({
      bio: "AI researcher and open source contributor",
      focus: "Machine learning & agent systems",
      streak: 7,
      recentUpdates: [
        {
          id: "2026-03-28-alice@example.com-update",
          type: "update",
          user: {
            username: "alice",
            domain: "example.com",
            profileUrl: "https://example.com/alice",
            updatesUrl: "https://example.com/alice/updates/index.json",
            lastSeen: null,
          },
          timestamp: "2026-03-28",
          content: {
            type: "update",
            summary: "Published new paper",
            accomplishments: ["Drafted abstract", "Submitted to arXiv"],
            tags: ["research", "writing"],
          },
        },
      ],
    });
  }),

  http.get("https://personallog.ai/bob/profile.json", () => {
    return HttpResponse.json({
      bio: "Software engineer building tools for thought",
      focus: "Developer productivity",
      streak: 14,
    });
  }),

  http.get("https://example.com/alice/updates/index.json", () => {
    return HttpResponse.json({
      entries: [
        {
          date: "2026-03-28",
          streak: 7,
          tags: ["research"],
          summary: "Published new paper",
          accomplishments: ["Drafted abstract", "Submitted to arXiv"],
        },
      ],
      updatedAt: "2026-03-28T12:00:00Z",
    });
  }),

  http.get("https://personallog.ai/bob/updates/index.json", () => {
    return HttpResponse.json({
      entries: [
        {
          date: "2026-03-28",
          streak: 14,
          tags: ["coding"],
          summary: "Built new feature",
          accomplishments: ["Implemented auth", "Wrote tests"],
        },
      ],
      updatedAt: "2026-03-28T10:00:00Z",
    });
  })
);

beforeAll(() => mockServer.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  mockServer.resetHandlers();
  localStorage.clear();
});
afterAll(() => mockServer.close());

// ─── ProfileModal tests ───────────────────────────────────────────────────────────

describe("ProfileModal", () => {
  const mockUser: FollowedUser = {
    username: "alice",
    domain: "example.com",
    profileUrl: "https://example.com/alice",
    updatesUrl: "https://example.com/alice/updates/index.json",
    lastSeen: null,
  };

  it("should not render when closed", () => {
    const { container } = render(
      <ProfileModal
        user={mockUser}
        isOpen={false}
        onClose={vi.fn()}
      />
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it("should render profile when open", async () => {
    const onClose = vi.fn();
    render(
      <ProfileModal
        user={mockUser}
        isOpen={true}
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });

    expect(screen.getByText("AI researcher and open source contributor")).toBeInTheDocument();
    expect(screen.getByText("Machine learning & agent systems")).toBeInTheDocument();
    // Use getAllByText to find the streak number (it appears twice in the UI)
    expect(screen.getAllByText(/7/)).toHaveLength(2);
    expect(screen.getByText(/day streak/)).toBeInTheDocument(); // The text is split
  });

  it("should close when clicking close button", async () => {
    const onClose = vi.fn();

    render(
      <ProfileModal
        user={mockUser}
        isOpen={true}
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Close")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should close when pressing Escape key", async () => {
    const onClose = vi.fn();

    render(
      <ProfileModal
        user={mockUser}
        isOpen={true}
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should close when clicking backdrop", async () => {
    const onClose = vi.fn();

    render(
      <ProfileModal
        user={mockUser}
        isOpen={true}
        onClose={onClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // The dialog itself has the onClick handler for backdrop clicks
    // Clicking directly on it simulates a backdrop click (not on the modal content)
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);

    // Note: In the actual implementation, clicking on the modal content stops propagation
    // So clicking the dialog outer div triggers the close (backdrop click)
    // The inner modal content div stops propagation when clicked directly
    expect(onClose).toHaveBeenCalled();
  });
});

// ─── DiscoveryWidget tests ───────────────────────────────────────────────────────

describe("DiscoveryWidget", () => {
  const mockOnFollow = vi.fn();
  const mockOnProfileClick = vi.fn();
  const mockFollowingUsers: FollowedUser[] = [];

  beforeEach(() => {
    mockOnFollow.mockClear();
    mockOnProfileClick.mockClear();
  });

  it("should show initial empty state", () => {
    render(
      <DiscoveryWidget
        onFollow={mockOnFollow}
        onProfileClick={mockOnProfileClick}
        followingUsers={mockFollowingUsers}
      />
    );

    expect(screen.getByPlaceholderText("username@domain")).toBeInTheDocument();
    expect(screen.getByText("Discover users")).toBeInTheDocument();
  });

  it("should show validation error for invalid format", async () => {
    render(
      <DiscoveryWidget
        onFollow={mockOnFollow}
        onProfileClick={mockOnProfileClick}
        followingUsers={mockFollowingUsers}
      />
    );

    const input = screen.getByPlaceholderText("username@domain");
    fireEvent.input(input, { target: { value: "invalid-format" } });

    await waitFor(() => {
      expect(screen.getByText(/Invalid format/)).toBeInTheDocument();
    });
  });

  it("should find and display user results", async () => {
    render(
      <DiscoveryWidget
        onFollow={mockOnFollow}
        onProfileClick={mockOnProfileClick}
        followingUsers={mockFollowingUsers}
      />
    );

    const input = screen.getByPlaceholderText("username@domain");
    fireEvent.input(input, { target: { value: "alice@example.com" } });

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("Machine learning & agent systems")).toBeInTheDocument();
      expect(screen.getByText("1 update")).toBeInTheDocument();
    });
  });

  it("should call onFollow when clicking follow button", async () => {
    render(
      <DiscoveryWidget
        onFollow={mockOnFollow}
        onProfileClick={mockOnProfileClick}
        followingUsers={mockFollowingUsers}
      />
    );

    const input = screen.getByPlaceholderText("username@domain");
    fireEvent.input(input, { target: { value: "alice@example.com" } });

    await waitFor(() => {
      expect(screen.getByText("Follow")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Follow"));
    expect(mockOnFollow).toHaveBeenCalledWith("alice", "example.com");
  });

  it("should show Following state for followed users", async () => {
    const followedUser: FollowedUser = {
      username: "alice",
      domain: "example.com",
      profileUrl: "https://example.com/alice",
      updatesUrl: "https://example.com/alice/updates/index.json",
      lastSeen: null,
    };

    render(
      <DiscoveryWidget
        onFollow={mockOnFollow}
        onProfileClick={mockOnProfileClick}
        followingUsers={[followedUser]}
      />
    );

    const input = screen.getByPlaceholderText("username@domain");
    fireEvent.input(input, { target: { value: "alice@example.com" } });

    await waitFor(() => {
      expect(screen.getByText("Following")).toBeInTheDocument();
    });
  });
});

// ─── FollowButton tests ──────────────────────────────────────────────────────────

describe("FollowButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render button with following count", () => {
    const mockOnFollow = vi.fn();
    render(
      <FollowButton
        onFollow={mockOnFollow}
        followingCount={5}
      />
    );

    expect(screen.getByText("Follow")).toBeInTheDocument();
    expect(screen.getByText("(5)")).toBeInTheDocument();
  });

  it("should open dialog when clicked", async () => {
    const mockOnFollow = vi.fn();

    render(
      <FollowButton
        onFollow={mockOnFollow}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /follow/i }));

    await waitFor(() => {
      expect(screen.getByText("Follow a user")).toBeInTheDocument();
    });
  });

  it("should follow user with valid input", async () => {
    const mockOnFollow = vi.fn();

    render(
      <FollowButton
        onFollow={mockOnFollow}
      />
    );

    // Open dialog
    fireEvent.click(screen.getByRole("button", { name: /follow/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("username@domain")).toBeInTheDocument();
    });

    // Enter valid username@domain
    const input = screen.getByPlaceholderText("username@domain");
    fireEvent.input(input, { target: { value: "bob@personallog.ai" } });

    // Submit
    fireEvent.click(screen.getAllByText("Follow")[1]); // Second "Follow" button is the submit button

    expect(mockOnFollow).toHaveBeenCalledWith("bob", "personallog.ai");
  });

  it("should show validation error for invalid input", async () => {
    const mockOnFollow = vi.fn();

    render(
      <FollowButton
        onFollow={mockOnFollow}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /follow/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("username@domain")).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText("username@domain");
    fireEvent.input(input, { target: { value: "invalid" } });

    // Submit should trigger error
    fireEvent.click(screen.getAllByText("Follow")[1]); // Second "Follow" button is the submit button

    await waitFor(() => {
      expect(screen.getByText(/Invalid format/)).toBeInTheDocument();
    });

    expect(mockOnFollow).not.toHaveBeenCalled();
  });
});

// ─── ActivityFeedCard tests ──────────────────────────────────────────────────────

describe("ActivityFeedCard", () => {
  const mockUser: FollowedUser = {
    username: "alice",
    domain: "example.com",
    profileUrl: "https://example.com/alice",
    updatesUrl: "https://example.com/alice/updates/index.json",
    lastSeen: null,
  };

  const mockActivity: ActivityItem = {
    id: "2026-03-28-alice@example.com-update",
    type: "update",
    user: mockUser,
    timestamp: "2026-03-28T10:00:00Z",
    content: {
      type: "update",
      summary: "Published new paper on agent systems",
      accomplishments: ["Drafted abstract", "Submitted to arXiv", "Got reviews"],
      tags: ["research", "writing"],
    },
  };

  it("should render activity card", () => {
    const mockOnUserClick = vi.fn();
    render(
      <ActivityFeedCard
        activity={mockActivity}
        onUserClick={mockOnUserClick}
      />
    );

    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Published new paper on agent systems")).toBeInTheDocument();
    expect(screen.getByText("Drafted abstract")).toBeInTheDocument();
    expect(screen.getByText("Submitted to arXiv")).toBeInTheDocument();
    expect(screen.getByText("Got reviews")).toBeInTheDocument();
  });

  it("should render tags", () => {
    const mockOnUserClick = vi.fn();
    render(
      <ActivityFeedCard
        activity={mockActivity}
        onUserClick={mockOnUserClick}
      />
    );

    expect(screen.getByText("research")).toBeInTheDocument();
    expect(screen.getByText("writing")).toBeInTheDocument();
  });

  it("should call onUserClick when clicking username", async () => {
    const mockOnUserClick = vi.fn();

    render(
      <ActivityFeedCard
        activity={mockActivity}
        onUserClick={mockOnUserClick}
      />
    );

    fireEvent.click(screen.getByText("alice@example.com"));
    expect(mockOnUserClick).toHaveBeenCalledWith("alice", "example.com");
  });

  it("should render profile activity type", () => {
    const profileActivity: ActivityItem = {
      id: "profile-alice@example.com",
      type: "profile",
      user: mockUser,
      timestamp: "2026-03-28T10:00:00Z",
      content: {
        type: "profile",
        change: "Updated bio",
        previous: "Old bio",
      },
    };

    const mockOnUserClick = vi.fn();
    render(
      <ActivityFeedCard
        activity={profileActivity}
        onUserClick={mockOnUserClick}
      />
    );

    expect(screen.getByText("Updated bio")).toBeInTheDocument();
    expect(screen.getByText("Was: Old bio")).toBeInTheDocument();
  });

  it("should render module activity type", () => {
    const moduleActivity: ActivityItem = {
      id: "module-alice@example.com",
      type: "module",
      user: mockUser,
      timestamp: "2026-03-28T10:00:00Z",
      content: {
        type: "module",
        module: "habit-tracker",
        action: "install",
      },
    };

    const mockOnUserClick = vi.fn();
    render(
      <ActivityFeedCard
        activity={moduleActivity}
        onUserClick={mockOnUserClick}
      />
    );

    expect(screen.getByText(/Installed/)).toBeInTheDocument();
    expect(screen.getByText("habit-tracker")).toBeInTheDocument();
  });
});
