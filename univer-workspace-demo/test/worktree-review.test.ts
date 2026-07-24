import { describe, expect, it } from "vitest";
import {
  lifecycleActions,
  reviewUnitUrl,
  worktreeReviewView,
  type ReviewWorktree,
} from "../src/worktrees/review.js";

const worktree: ReviewWorktree = {
  worktreeID: "wt/1",
  name: "Agent budget",
  summary: "Update Q3 assumptions",
  creatorUserID: "user-alice",
  creatorName: "Alice",
  scope: { kind: "user", userID: "user-alice" },
  visibility: "private",
  status: "ready",
  units: [
    {
      unitID: "unit/1",
      type: 2,
      source: "trunk",
      resourceID: "resource-1",
      resourceStatus: "active",
      name: "Budget",
      spaceID: "personal-alice",
      baselineTrunkRevision: 1,
      draftHeadRevision: 2,
      readyDraftHeadRevision: 2,
      mergeResult: {
        status: "failed",
        error: {
          code: "PERMISSION_DENIED",
          message: "Blocked",
          retryable: false,
        },
      },
    },
  ],
  createdAt: 1,
  updatedAt: 2,
};

describe("Worktree review UI", () => {
  it("shows read-only Unit facts and partial merge results", () => {
    const html = worktreeReviewView({
      worktrees: [worktree],
      selectedWorktreeID: worktree.worktreeID,
      selectedUnitID: worktree.units[0]!.unitID,
      mode: "draft",
      view: "active",
      scope: "all",
      spaces: [],
    });

    expect(html).toContain("Agent budget");
    expect(html).toContain("Alice");
    expect(html).toContain("Budget");
    expect(html).toContain("合并失败");
    expect(html).toContain("PERMISSION_DENIED");
    expect(html).toContain("只读预览");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("contenteditable");
  });

  it("offers lifecycle actions from current aggregate state", () => {
    expect(lifecycleActions({ ...worktree, status: "draft" })).toEqual([
      "ready",
      "discard",
    ]);
    expect(lifecycleActions(worktree)).toEqual([
      "reopen",
      "merge",
      "discard",
    ]);
    expect(
      lifecycleActions({ ...worktree, status: "merged" })
    ).toEqual([]);
  });

  it("builds an encoded isolated review URL", () => {
    expect(
      reviewUnitUrl(worktree.worktreeID, worktree.units[0]!, "merge")
    ).toBe(
      "/?reviewWorktree=wt%2F1&unit=unit%2F1&type=2&reviewMode=merge"
    );
  });
});
