import type { WorktreeStatus } from "@univerjs-pro/collaboration-worktree-service";
import { UniverType } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import {
  groupWorktrees,
  mergePreviewPresentation,
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

  it("defaults behind Units to merge preview and hides duplicate views", () => {
    expect(
      mergePreviewPresentation({
        status: "preview",
        worktreeID: "worktree-1",
        unitID: "unit-1",
        preview: {
          snapshot: {
            unitID: "unit-1",
            type: UniverType.UNIVER_SHEET,
            rev: 3,
            workbook: undefined,
            doc: undefined,
            slide: undefined,
            board: undefined,
          },
        },
      })
    ).toEqual({ showSwitch: true, defaultView: "merge-preview" });
    expect(
      mergePreviewPresentation({
        status: "conflict",
        worktreeID: "worktree-1",
        unitID: "unit-1",
        error: {
          code: "OT_CONFLICT",
          message: "conflict",
          retryable: false,
        },
      })
    ).toEqual({ showSwitch: true, defaultView: "merge-preview" });
    expect(
      mergePreviewPresentation({
        status: "not-behind",
        worktreeID: "worktree-1",
        unitID: "unit-1",
      })
    ).toEqual({ showSwitch: false, defaultView: "worktree" });
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
