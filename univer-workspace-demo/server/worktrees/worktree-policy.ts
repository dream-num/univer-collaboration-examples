import type { ResourceAccessRole, SpaceAccessRole } from "../product-store.js";
import type {
  WorkspaceWorktreeScope,
  WorkspaceWorktreeVisibility,
} from "./model.js";

export interface WorktreePolicySubject {
  readonly creatorUserID: string;
  readonly scope: WorkspaceWorktreeScope;
  readonly visibility: WorkspaceWorktreeVisibility;
}

export function canDiscoverWorktree(
  actorUserID: string,
  worktree: WorktreePolicySubject,
  spaceRole: SpaceAccessRole | null
): boolean {
  if (actorUserID === worktree.creatorUserID) return true;
  return (
    worktree.scope.kind === "space" &&
    worktree.visibility === "space" &&
    spaceRole !== null
  );
}

export const canReviewWorktree = canDiscoverWorktree;

export function canCreateWorktree(
  scope: CreateWorktreeScope,
  actorUserID: string,
  spaceRole: SpaceAccessRole | null
): boolean {
  return scope.kind === "user"
    ? scope.userID === actorUserID
    : isSpaceEditor(spaceRole);
}

export function canEditWorktree(
  actorUserID: string,
  worktree: WorktreePolicySubject,
  spaceRole: SpaceAccessRole | null
): boolean {
  if (actorUserID !== worktree.creatorUserID) return false;
  return worktree.scope.kind === "user" || isSpaceEditor(spaceRole);
}

export function canMergeWorktree(
  actorUserID: string,
  worktree: WorktreePolicySubject,
  spaceRole: SpaceAccessRole | null
): boolean {
  return worktree.scope.kind === "user"
    ? actorUserID === worktree.creatorUserID
    : isSpaceEditor(spaceRole);
}

export function canReopenWorktree(
  actorUserID: string,
  worktree: WorktreePolicySubject,
  spaceRole: SpaceAccessRole | null
): boolean {
  return worktree.scope.kind === "user"
    ? actorUserID === worktree.creatorUserID
    : actorUserID === worktree.creatorUserID ||
        spaceRole === "owner" ||
        spaceRole === "admin";
}

export const canDiscardWorktree = canReopenWorktree;

export function canReadResource(role: ResourceAccessRole | null): boolean {
  return role !== null;
}

export function canEditResource(role: ResourceAccessRole | null): boolean {
  return role !== null && role !== "viewer";
}

export function isSpaceEditor(role: SpaceAccessRole | null): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

export type CreateWorktreeScope =
  | { readonly kind: "user"; readonly userID: string }
  | { readonly kind: "space"; readonly spaceID: string };
