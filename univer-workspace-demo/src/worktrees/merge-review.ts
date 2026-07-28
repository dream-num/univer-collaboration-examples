import type { SaveSnapshotInput } from "@univerjs-pro/collaboration-service";
import type { WorktreeUnitMergeEvaluation } from "@univerjs-pro/collaboration-worktree-service";
import {
  WorktreeClient,
  type WorktreeFetch,
} from "@univerjs-pro/collaboration-worktree-client";
import type { ReviewCollaborationScope } from "../collaboration.js";

export interface MergeReviewEvaluation {
  readonly status: string;
  readonly preview?: SaveSnapshotInput;
}

export interface LoadMergeReviewEvaluationOptions {
  readonly origin: string;
  readonly worktreeID: string;
  readonly unitID: string;
  readonly fetch?: WorktreeFetch;
}

export type MergeReviewResolution =
  | { readonly scope: ReviewCollaborationScope }
  | { readonly unavailable: "conflict" | "missing" };

export function loadMergeReviewEvaluation(
  options: LoadMergeReviewEvaluationOptions
): Promise<WorktreeUnitMergeEvaluation> {
  return new WorktreeClient({
    origin: options.origin,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  }).evaluateUnitMerge(options.worktreeID, options.unitID);
}

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
