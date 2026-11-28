// Data passed between the migration steps. Source readers produce these values, target writers and
// verifiers consume them. Protocol objects use `@univerjs/protocol` types unchanged.
import type { ChangesetRecord } from "@univerjs-pro/collaboration-service";
import type { ISheetBlock, ISnapshot, UniverType } from "@univerjs/protocol";

/** One row of `universer.unit`. */
export interface SourceUnitRow {
  readonly unitID: string;
  readonly type: UniverType;
  readonly creator: string;
  readonly name: string;
  readonly createdAtMs: number;
  /** Set when the Unit is soft-deleted (in the trash). */
  readonly deletedAtMs: number | null;
  /** Non-empty while Universer is purging the Unit; such Units are not migrated. */
  readonly purgeStatus: string;
  readonly customerIdempotencyKey: string | null;
  readonly customerMetaData: string;
}

/** A snapshot rebuilt from the Universer tables, with every Sheet block it references. */
export interface SourceSnapshot {
  readonly snapshot: ISnapshot;
  readonly sheetBlocks: readonly ISheetBlock[];
}

/** A changeset in the SDK form, with the original creation time in milliseconds. */
export interface SourceChangeset {
  readonly record: ChangesetRecord;
  /** The protocol `createTime` is in seconds; the SDK stores milliseconds next to it. */
  readonly createdAtMs: number;
}

/** One row of `universer.unit_comment`. */
export interface SourceComment {
  readonly threadID: string;
  readonly replyID: string;
  readonly authorUserID: string;
  readonly content: string;
  readonly mentions: readonly string[];
  readonly solved: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/** One stored file referenced by a snapshot or changeset (images, PDF sources). */
export interface SourceFile {
  readonly fileID: string;
  readonly name: string;
  readonly size: number;
  readonly source: number;
  readonly assign: string;
  /** Object key in the Universer bucket. */
  readonly objectKey: string;
  readonly createdAtMs: number;
}

/** Everything the migration writes for one Unit, read in one consistent transaction. */
export interface SourceUnit {
  readonly unit: SourceUnitRow;
  /** Ascending by revision; the first one is always revision 1. */
  readonly snapshots: readonly SourceSnapshot[];
  /** Revisions 2 … head, contiguous, already converted to the SDK form. */
  readonly changesets: readonly SourceChangeset[];
  readonly headRevision: number;
  readonly comments: readonly SourceComment[];
  /** Files the Unit refers to that still exist in Universer. */
  readonly files: readonly SourceFile[];
  /** Files the Unit refers to that Universer no longer has; they are already broken there. */
  readonly missingFileIDs: readonly string[];
}

/** Outcome of one Unit, as reported to `ProgressListener` and written to the manifest. */
export interface UnitResult {
  readonly unitID: string;
  readonly type: number;
  /**
   * `checked`: dry run, the source was read and rebuilt without writing.
   * `resumed`: the Unit already existed in the target and the missing revisions were appended.
   * `up-to-date`: the target already had every revision.
   */
  readonly status: "migrated" | "resumed" | "up-to-date" | "checked" | "skipped" | "failed";
  readonly softDeleted?: boolean;
  readonly missingFiles?: readonly string[];
  readonly sourceHead?: number;
  readonly targetHead?: number;
  readonly snapshots?: number;
  readonly changesets?: number;
  readonly blocks?: number;
  readonly files?: number;
  readonly comments?: number;
  readonly verified?: boolean;
  readonly reason?: string;
  readonly error?: string;
  readonly durationMs?: number;
}
