import { describe, expect, it } from "vitest";
import type { ReviewWorktree } from "../src/worktrees/review.js";
import {
  outstandingWorktreeCount,
  worktreeCountBadge,
} from "../src/worktrees/task-count.js";

const worktree = (status: ReviewWorktree["status"]): ReviewWorktree => ({
  worktreeID: status,
  name: status,
  creatorUserID: "user-alice",
  creatorName: "Alice",
  scope: { kind: "user", userID: "user-alice" },
  visibility: "private",
  status,
  units: [],
  createdAt: 1,
  updatedAt: 1,
});

describe("Worktree task count", () => {
  it("counts running and ready tasks but excludes processed tasks", () => {
    expect(
      outstandingWorktreeCount([
        worktree("draft"),
        worktree("merging"),
        worktree("ready"),
        worktree("merged"),
        worktree("discarded"),
      ])
    ).toBe(3);
  });

  it("only renders the navigation badge for a positive count", () => {
    expect(worktreeCountBadge(0)).toBe("");
    expect(worktreeCountBadge(3)).toContain(
      'aria-label="3 个正在进行或待确认的任务"'
    );
    expect(worktreeCountBadge(3)).toContain(">3</span>");
  });
});
