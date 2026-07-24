import type {
  WorktreeData,
  WorktreeStatus,
  WorktreeUnitMergeEvaluation,
} from "@univerjs/collaboration-worktree-service";
import { DEMO_TRUNK_UNIT_ID } from "../../shared/demo.js";

export interface DemoWorktree extends WorktreeData {
  readonly name: string;
  readonly createdAt: number;
  readonly completedAt?: number;
}

export interface WorktreeGroups {
  readonly active: readonly DemoWorktree[];
  readonly processed: readonly DemoWorktree[];
}

export type WorktreeViewerKind = "worktree" | "merge-preview";

export interface MergePreviewPresentation {
  readonly showSwitch: boolean;
  readonly defaultView: WorktreeViewerKind;
}

export async function listWorktrees(): Promise<readonly DemoWorktree[]> {
  const url = new URL("/api/worktrees", window.location.origin);
  url.searchParams.set("unitID", DEMO_TRUNK_UNIT_ID);
  const response = await fetch(url);
  const body = await readJson(response);
  if (!response.ok) throw responseError(body, response.status);
  return (body as { readonly worktrees: readonly DemoWorktree[] })
    .worktrees;
}

export async function createWorktree(
  name: string
): Promise<DemoWorktree> {
  const response = await fetch("/api/worktrees", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      unitIDs: [DEMO_TRUNK_UNIT_ID],
    }),
  });
  const body = await readJson(response);
  if (!response.ok) throw responseError(body, response.status);
  return (body as { readonly worktree: DemoWorktree }).worktree;
}

export function groupWorktrees(
  worktrees: readonly DemoWorktree[]
): WorktreeGroups {
  const active = worktrees
    .filter(({ status }) => !isProcessedStatus(status))
    .sort((left, right) => right.createdAt - left.createdAt);
  const processed = worktrees
    .filter(({ status }) => isProcessedStatus(status))
    .sort(
      (left, right) =>
        (right.completedAt ?? right.createdAt) -
        (left.completedAt ?? left.createdAt)
    );
  return { active, processed };
}

export function isProcessedStatus(status: WorktreeStatus): boolean {
  return status === "merged" || status === "discarded";
}

export function mergePreviewPresentation(
  evaluation: WorktreeUnitMergeEvaluation
): MergePreviewPresentation {
  switch (evaluation.status) {
    case "preview":
    case "conflict":
      return { showSwitch: true, defaultView: "merge-preview" };
    case "not-behind":
    case "already-merged":
    case "not-applicable":
      return { showSwitch: false, defaultView: "worktree" };
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function responseError(body: unknown, status: number): Error {
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    (body as { error?: unknown }).error &&
    typeof (body as { error: { message?: unknown } }).error.message ===
      "string"
      ? (body as { error: { message: string } }).error.message
      : `请求失败 (${status})`;
  return new Error(message);
}
