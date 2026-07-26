import type { SaveSnapshotInput } from "@univerjs/collaboration-service";
import { describe, expect, it } from "vitest";
import { resolveMergeReview } from "../src/worktrees/merge-review.js";

describe("resolveMergeReview", () => {
  it("uses the Worktree draft when trunk is not behind", () => {
    expect(resolveMergeReview("worktree-1", { status: "not-behind" })).toEqual({
      scope: { kind: "worktree", worktreeID: "worktree-1" },
    });
  });

  it("uses the materialized snapshot when trunk changes need rebasing", () => {
    const preview = {
      snapshot: { unitID: "unit-1", type: 5, rev: 3 },
    } as SaveSnapshotInput;

    expect(
      resolveMergeReview("worktree-1", { status: "preview", preview })
    ).toEqual({
      scope: { kind: "merge", worktreeID: "worktree-1", preview },
    });
  });

  it("keeps conflicts unavailable", () => {
    expect(resolveMergeReview("worktree-1", { status: "conflict" })).toEqual({
      unavailable: "conflict",
    });
  });
});
