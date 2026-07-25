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
      filter: "all",
      scope: "all",
      spaces: [],
    });

    expect(html).toContain("智能工作台");
    expect(html).toContain(
      "查看 AI 正在进行/已完成的文档任务，确认后纳入正式版本。"
    );
    expect(html).toContain("Agent budget");
    expect(html).toContain("Alice");
    expect(html).toContain("Budget");
    expect(html).toContain("合并失败");
    expect(html).toContain("PERMISSION_DENIED");
    expect(html).toContain("只读预览");
    expect(html).toContain("正式版本 r1 → AI 修改版 r2");
    expect(html).toContain(">丢弃</button>");
    expect(html).toContain(">合入</button>");
    expect(html).toContain("data-review-expand");
    expect(html).toContain("worktree-preview-frame");
    expect(html).not.toContain("Agent Worktrees");
    expect(html).not.toContain("<h3>Units</h3>");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("contenteditable");
  });

  it("renders a vertical task tree and keeps processed tasks collapsed by default", () => {
    const html = worktreeReviewView({
      worktrees: [
        { ...worktree, status: "draft", worktreeID: "running" },
        { ...worktree, status: "merged", worktreeID: "processed" },
      ],
      selectedWorktreeID: "running",
      selectedUnitID: worktree.units[0]!.unitID,
      mode: "draft",
      filter: "all",
      scope: "all",
      spaces: [],
    });

    expect(html).toContain('class="task-tree-group task-tree-group-running" open');
    expect(html).toContain('class="task-tree-group task-tree-group-ready" open');
    expect(html).toContain('class="task-tree-group task-tree-group-processed"');
    expect(html).not.toContain(
      'class="task-tree-group task-tree-group-processed" open'
    );
    expect(html).toContain('class="task-document-item active"');
    expect(html).toContain("data-worktree-unit");

    const processedOnly = worktreeReviewView({
      worktrees: [{ ...worktree, status: "merged", worktreeID: "processed" }],
      mode: "draft",
      filter: "all",
      scope: "all",
      spaces: [],
    });
    expect(processedOnly).not.toContain("worktree-preview-frame");
  });

  it("offers lifecycle actions from current aggregate state", () => {
    expect(lifecycleActions({ ...worktree, status: "draft" })).toEqual([
      "discard",
      "ready",
    ]);
    expect(lifecycleActions(worktree)).toEqual(["discard", "merge"]);
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
