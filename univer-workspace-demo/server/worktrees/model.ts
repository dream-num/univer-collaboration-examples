import type { IChangeset, UniverType } from "@univerjs/protocol";
import type { IDocumentData } from "@univerjs/core";
import type {
  WorktreeMergeError,
  WorktreeStatus,
  WorktreeUnitMergeResult,
  WorktreeUnitSource,
} from "@univerjs/collaboration-worktree-service";

export type WorkspaceWorktreeScope =
  | { readonly kind: "user"; readonly userID: string }
  | { readonly kind: "space"; readonly spaceID: string };

export type WorkspaceWorktreeVisibility = "private" | "space";
export type WorkspaceWorktreeView = "active" | "processed";
export type StagedResourceStatus =
  | "staged"
  | "activation-pending"
  | "active"
  | "discarded";

export interface WorkspaceWorktreeUnit {
  readonly unitID: string;
  readonly type: UniverType;
  readonly source: WorktreeUnitSource;
  readonly resourceID: string;
  readonly resourceStatus: "active" | StagedResourceStatus;
  readonly name: string;
  readonly spaceID: string;
  readonly parentID: string | null;
  readonly baselineTrunkRevision: number | null;
  readonly draftHeadRevision: number;
  readonly readyDraftHeadRevision?: number;
  readonly mergeResult?: WorktreeUnitMergeResult;
}

export interface WorkspaceWorktree {
  readonly worktreeID: string;
  readonly name: string;
  readonly summary?: string;
  readonly creatorUserID: string;
  readonly creatorName: string;
  readonly scope: WorkspaceWorktreeScope;
  readonly visibility: WorkspaceWorktreeVisibility;
  readonly status: WorktreeStatus;
  readonly units: readonly WorkspaceWorktreeUnit[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly processedAt?: number;
}

export interface CreateWorkspaceWorktreeInput {
  readonly worktreeID: string;
  readonly name: string;
  readonly scope:
    | { readonly kind: "user" }
    | { readonly kind: "space"; readonly spaceID: string };
  readonly visibility?: WorkspaceWorktreeVisibility;
  readonly resourceIDs?: readonly string[];
  readonly summary?: string;
}

export interface UpdateWorkspaceWorktreeInput {
  readonly name?: string;
  readonly visibility?: WorkspaceWorktreeVisibility;
  readonly summary?: string | null;
}

export interface CreateWorkspaceWorktreeUnitInput {
  readonly resourceID: string;
  readonly unitID: string;
  readonly spaceID: string;
  readonly parentID?: string | null;
  readonly name: string;
  readonly type: UniverType;
  readonly initialData?: IDocumentData;
}

export type SubmitWorkspaceChangesetResult =
  | {
      readonly status: "committed" | "already-committed";
      readonly changeset: IChangeset;
    }
  | {
      readonly status: "rejected" | "retry";
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
        readonly details?: Readonly<Record<string, unknown>>;
      };
    };

export type WorkspaceWorktreeMergeError = WorktreeMergeError;
