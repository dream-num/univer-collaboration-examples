import type { ReviewWorktree } from "./review.js";

export function outstandingWorktreeCount(
  worktrees: readonly ReviewWorktree[]
): number {
  return worktrees.filter(
    ({ status }) =>
      status === "draft" || status === "merging" || status === "ready"
  ).length;
}

export function worktreeCountBadge(count: number): string {
  if (count <= 0) return "";
  return `<span class="worktree-task-count" aria-label="${count} 个正在进行或待确认的任务">${count}</span>`;
}
