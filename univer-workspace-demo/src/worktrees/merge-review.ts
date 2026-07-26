import type { SaveSnapshotInput } from "@univerjs/collaboration-service";
import type { ReviewCollaborationScope } from "../collaboration.js";

export interface MergeReviewEvaluation {
  readonly status: string;
  readonly preview?: SaveSnapshotInput;
}

export type MergeReviewResolution =
  | { readonly scope: ReviewCollaborationScope }
  | { readonly unavailable: "conflict" | "missing" };

export function resolveMergeReview(
  worktreeID: string,
  evaluation: MergeReviewEvaluation
): MergeReviewResolution {
  if (evaluation.status === "not-behind") {
    return { scope: { kind: "worktree", worktreeID } };
  }
  if (evaluation.status === "preview" && evaluation.preview !== undefined) {
    return {
      scope: {
        kind: "merge",
        worktreeID,
        preview: evaluation.preview,
      },
    };
  }
  return {
    unavailable: evaluation.status === "conflict" ? "conflict" : "missing",
  };
}
