import type { WorktreeStatus } from "@univerjs/collaboration-worktree-service";
import { describe, expect, it } from "vitest";
import {
  groupWorktrees,
  type DemoWorktree,
} from "../client/sheets/api.js";

describe("basic-sheets-worktree client model", () => {
  it("separates active and processed Worktrees in newest-first order", () => {
    const worktrees = [
      worktree("draft-old", "draft", 10),
      worktree("merged-old", "merged", 20, 30),
      worktree("ready-new", "ready", 40),
      worktree("discarded-new", "discarded", 5, 50),
      worktree("merging-middle", "merging", 35),
    ];

    expect(groupWorktrees(worktrees)).toMatchObject({
      active: [
        { worktreeID: "ready-new" },
        { worktreeID: "merging-middle" },
        { worktreeID: "draft-old" },
      ],
      processed: [
        { worktreeID: "discarded-new" },
        { worktreeID: "merged-old" },
      ],
    });
  });
});

function worktree(
  worktreeID: string,
  status: WorktreeStatus,
  createdAt: number,
  completedAt?: number
): DemoWorktree {
  return {
    worktreeID,
    name: worktreeID,
    status,
    units: [],
    createdAt,
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}
