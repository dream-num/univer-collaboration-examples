export const WORKSPACE_WORKTREE_ORCHESTRATION = Symbol(
  "workspace-worktree-orchestration"
);

export function orchestrationCustomData(): Record<PropertyKey, unknown> {
  return {
    [WORKSPACE_WORKTREE_ORCHESTRATION]: true,
  };
}

export function isOrchestrated(
  customData: Readonly<Record<PropertyKey, unknown>>
): boolean {
  return customData[WORKSPACE_WORKTREE_ORCHESTRATION] === true;
}
