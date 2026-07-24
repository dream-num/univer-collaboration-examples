export const origin = window.location.origin;
export const url = new URL(window.location.href);
export const worktreeID = url.searchParams.get("worktree");
export const unitID = url.searchParams.get("unit");
