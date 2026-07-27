import type { SaveSnapshotInput } from "@univerjs-pro/collaboration-service";
import { UniverType } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import {
  loadMergeReviewEvaluation,
  resolveMergeReview,
} from "../src/worktrees/merge-review.js";

describe("loadMergeReviewEvaluation", () => {
  it("decodes snapshot bytes before the preview reaches Univer", async () => {
    const evaluation = await loadMergeReviewEvaluation({
      origin: "http://127.0.0.1:3020",
      worktreeID: "worktree/1",
      unitID: "unit/1",
      fetch: async () =>
        Response.json({
          evaluation: {
            status: "preview",
            worktreeID: "worktree/1",
            unitID: "unit/1",
            preview: {
              snapshot: {
                unitID: "unit/1",
                type: UniverType.UNIVER_SHEET,
                rev: 3,
                workbook: {
                  unitID: "unit/1",
                  rev: 3,
                  creator: "",
                  name: "",
                  sheetOrder: ["sheet-1"],
                  sheets: {
                    "sheet-1": {
                      id: "sheet-1",
                      name: "Sheet 1",
                      rowCount: 10,
                      columnCount: 10,
                      originalMeta: "BAU=",
                    },
                  },
                  resources: [],
                  blockMeta: {},
                  originalMeta: "AQID",
                },
              },
              sheetBlocks: [
                {
                  id: "block-1",
                  startRow: 0,
                  endRow: 9,
                  data: "Bgc=",
                },
              ],
            },
          },
        }),
    });

    expect(evaluation).toMatchObject({
      status: "preview",
      preview: {
        snapshot: {
          workbook: {
            originalMeta: new Uint8Array([1, 2, 3]),
            sheets: {
              "sheet-1": { originalMeta: new Uint8Array([4, 5]) },
            },
          },
        },
        sheetBlocks: [{ data: new Uint8Array([6, 7]) }],
      },
    });
  });
});

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
