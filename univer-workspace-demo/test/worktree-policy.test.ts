import { describe, expect, it } from "vitest";
import {
  canDiscoverWorktree,
  canDiscardWorktree,
  canEditWorktree,
  canMergeWorktree,
  canReopenWorktree,
} from "../server/worktrees/worktree-policy.js";

describe("Workspace Worktree policy", () => {
  const userWorktree = {
    creatorUserID: "alice",
    scope: { kind: "user" as const, userID: "alice" },
    visibility: "private" as const,
  };
  const privateSpaceWorktree = {
    creatorUserID: "alice",
    scope: { kind: "space" as const, spaceID: "team-1" },
    visibility: "private" as const,
  };
  const visibleSpaceWorktree = {
    ...privateSpaceWorktree,
    visibility: "space" as const,
  };

  it("keeps user-scoped Worktrees private to the creator", () => {
    expect(canDiscoverWorktree("alice", userWorktree, null)).toBe(true);
    expect(canDiscoverWorktree("bob", userWorktree, "owner")).toBe(false);
    expect(canEditWorktree("alice", userWorktree, null)).toBe(true);
    expect(canMergeWorktree("bob", userWorktree, "owner")).toBe(false);
  });

  it("lets current Team members review only visible Space Worktrees", () => {
    expect(canDiscoverWorktree("bob", privateSpaceWorktree, "viewer")).toBe(
      false
    );
    expect(canDiscoverWorktree("bob", visibleSpaceWorktree, "viewer")).toBe(
      true
    );
    expect(canDiscoverWorktree("bob", visibleSpaceWorktree, null)).toBe(false);
  });

  it("keeps editing creator-owned while allowing Team lifecycle managers", () => {
    expect(canEditWorktree("alice", visibleSpaceWorktree, "editor")).toBe(
      true
    );
    expect(canEditWorktree("alice", visibleSpaceWorktree, "viewer")).toBe(
      false
    );
    expect(canEditWorktree("bob", visibleSpaceWorktree, "owner")).toBe(false);
    expect(canMergeWorktree("bob", visibleSpaceWorktree, "editor")).toBe(true);
    expect(canMergeWorktree("bob", visibleSpaceWorktree, "viewer")).toBe(false);
    expect(canReopenWorktree("bob", visibleSpaceWorktree, "admin")).toBe(true);
    expect(canDiscardWorktree("bob", visibleSpaceWorktree, "viewer")).toBe(
      false
    );
  });
});
