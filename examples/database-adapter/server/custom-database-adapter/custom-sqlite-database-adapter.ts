import type { Buffer } from "node:buffer";
import { Decoder, Encoder } from "@msgpack/msgpack";
import Database from "libsql";
import { CollabError } from "@univerjs-pro/collaboration-service";
import type {
  CommitChangesetInput,
  CommitChangesetResult,
  CreateUnitDatabaseInput,
  CreateUnitDatabaseResult,
  DatabaseContext,
  DeleteUnitsDatabaseInput,
  DeleteUnitsDatabaseResult,
  IDatabaseAdapter,
  RecoverUnitsDatabaseInput,
  RecoverUnitsDatabaseResult,
  SaveSnapshotInput,
  SnapshotInfo,
  SubmitDatabaseContext,
  UnitRecord,
} from "@univerjs-pro/collaboration-service";
import type { IChangeset, ISheetBlock, ISnapshot } from "@univerjs/protocol";

interface UnitRow extends UnitRecord {
  readonly deletedStatus: "soft" | "hard" | null;
}

interface PayloadRow {
  readonly payload: ArrayBuffer | Buffer;
}

export interface CustomSQLiteDatabaseAdapterOptions {
  readonly filename: string;
}

/** A custom collaboration database adapter backed by libSQL. */
export class CustomSQLiteDatabaseAdapter implements IDatabaseAdapter {
  private readonly _database: Database.Database;
  private readonly _encoder = new Encoder({ ignoreUndefined: true });
  private readonly _decoder = new Decoder();

  private readonly _getUnitStatement: Database.Statement;
  private readonly _getSnapshotStatement: Database.Statement;
  private readonly _getSnapshotAtRevisionStatement: Database.Statement;
  private readonly _getSnapshotInfoStatement: Database.Statement;
  private readonly _getSnapshotInfoAtRevisionStatement: Database.Statement;
  private readonly _getChangesetsStatement: Database.Statement;
  private readonly _getChangesetsInRangeStatement: Database.Statement;
  private readonly _getSheetBlockStatement: Database.Statement;
  private readonly _writeSheetBlockStatement: Database.Statement;
  private readonly _writeSnapshotStatement: Database.Statement;
  private readonly _insertUnitStatement: Database.Statement;
  private readonly _insertChangesetStatement: Database.Statement;
  private readonly _updateHeadRevisionStatement: Database.Statement;
  private readonly _deleteSnapshotsStatement: Database.Statement;
  private readonly _deleteChangesetsStatement: Database.Statement;
  private readonly _deleteSheetBlocksStatement: Database.Statement;
  private readonly _hardDeleteUnitStatement: Database.Statement;
  private readonly _softDeleteUnitStatement: Database.Statement;
  private readonly _recoverUnitStatement: Database.Statement;

  constructor(options: CustomSQLiteDatabaseAdapterOptions) {
    this._database = new Database(options.filename);

    try {
      this._database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      this._initializeTables();

      this._getUnitStatement = this._database.prepare(`
        SELECT unit_id AS unitID, type, head_revision AS headRevision, deleted_status AS deletedStatus
        FROM units
        WHERE unit_id = ?
      `);

      this._getSnapshotStatement = this._database.prepare(`
        SELECT s.payload
        FROM snapshots s
        JOIN units u ON u.unit_id = s.unit_id
        WHERE u.unit_id = ?
          AND u.deleted_status IS NULL
        ORDER BY s.revision DESC
        LIMIT 1
      `);
      this._getSnapshotAtRevisionStatement = this._database.prepare(`
        SELECT s.payload
        FROM snapshots s
        JOIN units u ON u.unit_id = s.unit_id
        WHERE u.unit_id = ?
          AND u.deleted_status IS NULL
          AND s.revision <= ?
        ORDER BY s.revision DESC
        LIMIT 1
      `);

      this._getSnapshotInfoStatement = this._database.prepare(`
        SELECT s.unit_id AS unitID, u.type, s.revision AS rev
        FROM snapshots s
        JOIN units u ON u.unit_id = s.unit_id
        WHERE u.unit_id = ?
          AND u.deleted_status IS NULL
        ORDER BY s.revision DESC
        LIMIT 1
      `);
      this._getSnapshotInfoAtRevisionStatement = this._database.prepare(`
        SELECT s.unit_id AS unitID, u.type, s.revision AS rev
        FROM snapshots s
        JOIN units u ON u.unit_id = s.unit_id
        WHERE u.unit_id = ?
          AND u.deleted_status IS NULL
          AND s.revision <= ?
        ORDER BY s.revision DESC
        LIMIT 1
      `);

      this._getChangesetsStatement = this._database.prepare(`
        SELECT c.payload
        FROM units u
        LEFT JOIN changesets c ON c.unit_id = u.unit_id
          AND c.revision > ?
        WHERE u.unit_id = ?
          AND u.deleted_status IS NULL
        ORDER BY c.revision ASC
      `);
      this._getChangesetsInRangeStatement = this._database.prepare(`
        SELECT c.payload
        FROM units u
        LEFT JOIN changesets c ON c.unit_id = u.unit_id
          AND c.revision > ?
          AND c.revision <= ?
        WHERE u.unit_id = ?
          AND u.deleted_status IS NULL
        ORDER BY c.revision ASC
      `);

      this._getSheetBlockStatement = this._database.prepare(`
        SELECT b.payload FROM sheet_blocks b JOIN units u ON u.unit_id = b.unit_id
        WHERE u.unit_id = ? AND u.deleted_status IS NULL AND b.block_id = ?
      `);

      this._writeSheetBlockStatement = this._database.prepare(`
        INSERT INTO sheet_blocks (unit_id, block_id, payload) VALUES (?, ?, ?)
        ON CONFLICT (unit_id, block_id) DO UPDATE SET payload = excluded.payload
      `);
      this._writeSnapshotStatement = this._database.prepare(`
        INSERT INTO snapshots (unit_id, revision, payload) VALUES (?, ?, ?)
        ON CONFLICT (unit_id, revision) DO UPDATE SET payload = excluded.payload
      `);

      this._insertUnitStatement = this._database.prepare(
        "INSERT INTO units (unit_id, type, head_revision, creator_id, created_at_ms) VALUES (?, ?, 1, ?, ?)",
      );
      this._insertChangesetStatement = this._database.prepare(
        "INSERT INTO changesets (unit_id, revision, created_at_ms, payload) VALUES (?, ?, ?, ?)",
      );
      this._updateHeadRevisionStatement = this._database.prepare(
        "UPDATE units SET head_revision = ? WHERE unit_id = ?",
      );

      this._deleteSnapshotsStatement = this._database.prepare(
        "DELETE FROM snapshots WHERE unit_id = ?",
      );
      this._deleteChangesetsStatement = this._database.prepare(
        "DELETE FROM changesets WHERE unit_id = ?",
      );
      this._deleteSheetBlocksStatement = this._database.prepare(
        "DELETE FROM sheet_blocks WHERE unit_id = ?",
      );
      this._hardDeleteUnitStatement = this._database.prepare(
        "UPDATE units SET deleted_at_ms = ?, deleted_status = 'hard' WHERE unit_id = ?",
      );
      this._softDeleteUnitStatement = this._database.prepare(
        "UPDATE units SET deleted_at_ms = ?, deleted_status = 'soft' WHERE unit_id = ?",
      );
      this._recoverUnitStatement = this._database.prepare(
        "UPDATE units SET deleted_at_ms = NULL, deleted_status = NULL WHERE unit_id = ?",
      );
    } catch (error) {
      this._database.close();
      throw error;
    }
  }

  private _initializeTables(): void {
    this._database
      .transaction(() => {
        this._database.exec(`
          CREATE TABLE IF NOT EXISTS units (
            unit_id TEXT PRIMARY KEY NOT NULL,
            type INTEGER NOT NULL,
            head_revision INTEGER NOT NULL CHECK (head_revision >= 1),
            creator_id TEXT NOT NULL,
            created_at_ms INTEGER NOT NULL,
            deleted_at_ms INTEGER,
            deleted_status TEXT CHECK (deleted_status IN ('soft', 'hard')),
            CHECK ((deleted_status IS NULL) = (deleted_at_ms IS NULL))
          );
          CREATE TABLE IF NOT EXISTS snapshots (
            unit_id TEXT NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
            revision INTEGER NOT NULL CHECK (revision >= 1),
            payload BLOB NOT NULL,
            PRIMARY KEY (unit_id, revision)
          );
          CREATE TABLE IF NOT EXISTS changesets (
            unit_id TEXT NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
            revision INTEGER NOT NULL CHECK (revision >= 2),
            created_at_ms INTEGER NOT NULL,
            payload BLOB NOT NULL,
            PRIMARY KEY (unit_id, revision)
          );
          CREATE TABLE IF NOT EXISTS sheet_blocks (
            unit_id TEXT NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,
            block_id TEXT NOT NULL,
            payload BLOB NOT NULL,
            PRIMARY KEY (unit_id, block_id)
          );
        `);
      })
      .immediate();
  }

  async getUnit(_ctx: DatabaseContext, unitID: string): Promise<UnitRecord | null> {
    const unit = this._getStoredUnit(unitID);
    return unit && unit.deletedStatus === null ? toUnitRecord(unit) : null;
  }

  /** Reads the latest snapshot, optionally bounded by the specified revision. */
  async getSnapshot(
    _ctx: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<ISnapshot | null> {
    const revision = options?.revision;
    if (revision !== undefined && revision < 0) {
      throw new CollabError("INVALID_REQUEST", "Snapshot revision cannot be negative");
    }

    const row = (
      revision === undefined
        ? this._getSnapshotStatement.get(unitID)
        : this._getSnapshotAtRevisionStatement.get(unitID, revision)
    ) as PayloadRow | undefined;

    return row ? this._decode<ISnapshot>(row.payload) : null;
  }

  /** Reads metadata using the same criteria as getSnapshot, without loading or decoding its payload. */
  async getSnapshotInfo(
    _ctx: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<SnapshotInfo | null> {
    const revision = options?.revision;
    if (revision !== undefined && revision < 0) {
      throw new CollabError("INVALID_REQUEST", "Snapshot revision cannot be negative");
    }

    const row = (
      revision === undefined
        ? this._getSnapshotInfoStatement.get(unitID)
        : this._getSnapshotInfoAtRevisionStatement.get(unitID, revision)
    ) as SnapshotInfo | undefined;

    return row ? { unitID: row.unitID, type: row.type, rev: row.rev } : null;
  }

  /** Reads changesets in (from, to]; omitting to leaves the range unbounded, while 0 is an explicit upper bound. */
  async getChangesets(
    _ctx: DatabaseContext,
    unitID: string,
    range: { readonly from: number; readonly to?: number },
  ): Promise<readonly IChangeset[] | null> {
    if (range.from < 0 || (range.to !== undefined && range.to < 0)) {
      throw new CollabError("INVALID_REQUEST", "Changeset range revisions cannot be negative");
    }

    // LEFT JOIN distinguishes an inaccessible Unit (null) from a Unit with no matching history ([]).
    const rows = (
      range.to === undefined
        ? this._getChangesetsStatement.all(range.from, unitID)
        : this._getChangesetsInRangeStatement.all(range.from, range.to, unitID)
    ) as {
      payload: ArrayBuffer | Buffer | null;
    }[];

    if (rows.length === 0) return null;

    const changesets: IChangeset[] = [];
    for (const row of rows) {
      if (row.payload !== null) {
        changesets.push(this._decode<IChangeset>(row.payload));
      }
    }

    return changesets;
  }

  async getSheetBlock(
    _ctx: DatabaseContext,
    unitID: string,
    blockID: string,
  ): Promise<ISheetBlock | null> {
    const row = this._getSheetBlockStatement.get(unitID, blockID) as PayloadRow | undefined;

    return row ? this._decode<ISheetBlock>(row.payload) : null;
  }

  /** Atomically creates a Unit at revision 1 with its snapshot and blocks; an existing active Unit returns its record. */
  async createUnit(
    ctx: DatabaseContext,
    input: CreateUnitDatabaseInput,
  ): Promise<CreateUnitDatabaseResult> {
    const { record, snapshot, sheetBlocks = [] } = input;
    if (
      record.headRevision !== 1 ||
      snapshot.rev !== 1 ||
      snapshot.unitID !== record.unitID ||
      snapshot.type !== record.type
    ) {
      throw new CollabError(
        "INVALID_REQUEST",
        "Initial record and snapshot must match at revision 1",
      );
    }

    return this._database
      .transaction((): CreateUnitDatabaseResult => {
        const existing = this._getStoredUnit(record.unitID);
        if (existing) {
          if (existing.deletedStatus !== null) {
            throw new CollabError("INVALID_REQUEST", "A deleted unit ID cannot be reused");
          }
          return { status: "already-exists", record: toUnitRecord(existing) };
        }

        this._insertUnitStatement.run(record.unitID, record.type, ctx.userID, Date.now());
        this._writeSnapshotWithBlocks(snapshot, sheetBlocks);
        return { status: "created", record: { ...record } };
      })
      .immediate();
  }

  async commitChangeset(
    _ctx: SubmitDatabaseContext,
    input: CommitChangesetInput,
  ): Promise<CommitChangesetResult> {
    const { changeset } = input;

    return this._database
      .transaction((): CommitChangesetResult => {
        const unit = this._requireActiveUnit(changeset.unitID);
        const expectedHeadRevision = changeset.revision - 1;

        // Checks the head and commits within a write transaction to keep the version check and writes atomic.
        // The Service deduplicates requests; this check only compares changeset.revision - 1 with the head.
        if (unit.headRevision !== expectedHeadRevision) {
          return {
            status: "revision-mismatch",
            actualHeadRevision: unit.headRevision,
          };
        }

        const createdAt = Date.now();
        const committedChangeset = {
          ...changeset,
          createTime: Math.floor(createdAt / 1000),
        };
        this._insertChangesetStatement.run(
          changeset.unitID,
          changeset.revision,
          createdAt,
          this._encode(committedChangeset),
        );
        this._updateHeadRevisionStatement.run(changeset.revision, changeset.unitID);
        return {
          status: "committed",
          changeset: committedChangeset,
          headRevision: changeset.revision,
        };
      })
      .immediate();
  }

  /** Saves snapshot metadata and the supplied blocks. */
  async saveSnapshot(_ctx: DatabaseContext, input: SaveSnapshotInput): Promise<void> {
    this._database
      .transaction(() => {
        const { snapshot, sheetBlocks = [] } = input;
        const unit = this._requireActiveUnit(snapshot.unitID);
        if (snapshot.type !== unit.type || snapshot.rev < 1 || snapshot.rev > unit.headRevision) {
          throw new CollabError("INVALID_REQUEST", "Snapshot does not match the stored unit head");
        }
        this._writeSnapshotWithBlocks(snapshot, sheetBlocks);
      })
      .immediate();
  }

  /** Atomically deletes the specified Units; hard deletion retains Unit rows to prevent ID reuse. */
  async deleteUnits(
    _ctx: DatabaseContext,
    input: DeleteUnitsDatabaseInput,
  ): Promise<DeleteUnitsDatabaseResult> {
    if (input.unitIDs.length === 0) return { units: [] };

    return this._database
      .transaction((): DeleteUnitsDatabaseResult => {
        // The caller guarantees unique unitIDs.
        const units: DeleteUnitsDatabaseResult["units"] = input.unitIDs.map((unitID) => {
          const unit = this._getStoredUnit(unitID);
          if (!unit || (unit.deletedStatus === "hard" && !input.hardDelete)) {
            throw new CollabError("UNIT_NOT_FOUND", "Cannot delete a missing unit");
          }
          return {
            unitID,
            status: input.hardDelete
              ? unit.deletedStatus === "hard" ? "already-hard-deleted" : "hard-deleted"
              : unit.deletedStatus === null
                ? "soft-deleted"
                : "already-soft-deleted",
          };
        });

        const deletedAt = Date.now();
        for (const unit of units) {
          if (unit.status === "hard-deleted") {
            this._deleteSnapshotsStatement.run(unit.unitID);
            this._deleteChangesetsStatement.run(unit.unitID);
            this._deleteSheetBlocksStatement.run(unit.unitID);
            this._hardDeleteUnitStatement.run(deletedAt, unit.unitID);
          } else if (unit.status === "soft-deleted") {
            this._softDeleteUnitStatement.run(deletedAt, unit.unitID);
          }
        }

        return { units };
      })
      .immediate();
  }

  /** Atomically restores soft-deleted Units; hard-deleted IDs cannot be recovered. */
  async recoverUnits(
    _ctx: DatabaseContext,
    input: RecoverUnitsDatabaseInput,
  ): Promise<RecoverUnitsDatabaseResult> {
    if (input.unitIDs.length === 0) return { units: [] };

    return this._database
      .transaction((): RecoverUnitsDatabaseResult => {
        // The caller guarantees unique unitIDs.
        const units: RecoverUnitsDatabaseResult["units"] = input.unitIDs.map((unitID) => {
          const unit = this._getStoredUnit(unitID);
          if (!unit) {
            throw new CollabError("UNIT_NOT_FOUND", "Cannot recover a missing unit");
          }
          if (unit.deletedStatus === "hard") {
            throw new CollabError("INVALID_REQUEST", "A hard-deleted unit cannot be recovered");
          }
          return {
            unitID,
            status: unit.deletedStatus === null ? "already-active" : "recovered",
          };
        });

        for (const unit of units) {
          if (unit.status === "recovered") {
            this._recoverUnitStatement.run(unit.unitID);
          }
        }

        return { units };
      })
      .immediate();
  }

  async dispose(): Promise<void> {
    if (this._database.open) {
      this._database.close();
    }
  }

  private _getStoredUnit(unitID: string): UnitRow | undefined {
    return this._getUnitStatement.get(unitID) as UnitRow | undefined;
  }

  private _requireActiveUnit(unitID: string): UnitRow {
    const unit = this._getStoredUnit(unitID);
    if (!unit || unit.deletedStatus !== null) {
      throw new CollabError("UNIT_NOT_FOUND", "Unit is not active");
    }
    return unit;
  }

  private _encode(value: IChangeset | ISnapshot | ISheetBlock): Uint8Array {
    return this._encoder.encode(value);
  }

  private _decode<T>(payload: ArrayBuffer | Buffer): T {
    const bytes =
      payload instanceof ArrayBuffer
        ? new Uint8Array(payload)
        : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    // Uses a plain byte view so protocol binary fields decode as Uint8Array rather than Buffer.
    return this._decoder.decode(bytes) as T;
  }

  private _writeSnapshotWithBlocks(
    snapshot: ISnapshot,
    sheetBlocks: readonly ISheetBlock[],
  ): void {
    for (const block of sheetBlocks) {
      this._writeSheetBlockStatement.run(snapshot.unitID, block.id, this._encode(block));
    }

    this._writeSnapshotStatement.run(snapshot.unitID, snapshot.rev, this._encode(snapshot));
  }
}

function toUnitRecord(row: UnitRow): UnitRecord {
  return { unitID: row.unitID, type: row.type, headRevision: row.headRevision };
}
