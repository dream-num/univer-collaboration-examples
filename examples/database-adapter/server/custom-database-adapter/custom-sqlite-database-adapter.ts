import { decode, encode } from "@msgpack/msgpack";
import Database from "better-sqlite3";
import {
  CollabError,
  type CommitChangesetInput,
  type CommitChangesetResult,
  type CreateUnitDatabaseInput,
  type CreateUnitDatabaseResult,
  type DatabaseContext,
  type DeleteUnitsDatabaseInput,
  type DeleteUnitsDatabaseResult,
  type IDatabaseAdapter,
  type RecoverUnitsDatabaseInput,
  type RecoverUnitsDatabaseResult,
  type SaveSnapshotInput,
  type SnapshotInfo,
  type SubmitDatabaseContext,
  type UnitRecord,
} from "@univerjs-pro/collaboration-service";
import type { IChangeset, ISheetBlock, ISnapshot } from "@univerjs/protocol";

interface UnitRow extends UnitRecord {
  readonly deleted: number;
}

interface PayloadRow {
  readonly payload: Uint8Array;
}

/**
 * An IDatabaseAdapter that persists collaboration data using better-sqlite3.
 * SQL runs synchronously on the current thread; async methods satisfy the Promise interface.
 */
export class CustomSQLiteDatabaseAdapter implements IDatabaseAdapter {
  private readonly _database: Database.Database;

  /** Creates the database file if missing; the caller must create its parent directory first. */
  constructor(options: { readonly filename: string }) {
    this._database = new Database(options.filename);
    try {
      this._database.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
      this._database
        .transaction(() => {
          this._database.exec(`
            CREATE TABLE IF NOT EXISTS units (
              unit_id TEXT PRIMARY KEY NOT NULL,
              type INTEGER NOT NULL,
              head_revision INTEGER NOT NULL CHECK (head_revision >= 1),
              deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
            );
            CREATE TABLE IF NOT EXISTS tombstones (
              unit_id TEXT PRIMARY KEY NOT NULL
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
    } catch (error) {
      this._database.close();
      throw error;
    }
  }

  async getUnit(_ctx: DatabaseContext, unitID: string): Promise<UnitRecord | null> {
    const unit = this._getStoredUnit(unitID);
    return unit && unit.deleted === 0 ? toUnitRecord(unit) : null;
  }

  async getSnapshot(
    _ctx: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<ISnapshot | null> {
    const revision = options?.revision ?? null;
    if (revision !== null && revision < 0) {
      throw new CollabError("INVALID_REQUEST", "Snapshot revision cannot be negative");
    }

    // Check active status and read the head in one query to keep them consistent across connections.
    const row = this._database
      .prepare(`
        SELECT s.payload FROM snapshots s JOIN units u ON u.unit_id = s.unit_id
        WHERE u.unit_id = ? AND u.deleted = 0
          AND s.revision <= CASE WHEN ? IS NULL THEN u.head_revision
                                ELSE MIN(?, u.head_revision) END
        ORDER BY s.revision DESC LIMIT 1
      `)
      .get(unitID, revision, revision) as PayloadRow | undefined;
    return row ? decodePayload<ISnapshot>(row.payload) : null;
  }

  async getSnapshotInfo(
    _ctx: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<SnapshotInfo | null> {
    const revision = options?.revision ?? null;
    if (revision !== null && revision < 0) {
      throw new CollabError("INVALID_REQUEST", "Snapshot revision cannot be negative");
    }

    // 与 getSnapshot 使用同一选择条件，但不读取或解码快照 payload。
    const row = this._database
      .prepare(`
        SELECT s.unit_id AS unitID, u.type, s.revision AS rev
        FROM snapshots s JOIN units u ON u.unit_id = s.unit_id
        WHERE u.unit_id = ? AND u.deleted = 0
          AND s.revision <= CASE WHEN ? IS NULL THEN u.head_revision
                                ELSE MIN(?, u.head_revision) END
        ORDER BY s.revision DESC LIMIT 1
      `)
      .get(unitID, revision, revision) as SnapshotInfo | undefined;
    return row ?? null;
  }

  async getChangesets(
    _ctx: DatabaseContext,
    unitID: string,
    range: { readonly from: number; readonly to?: number },
  ): Promise<readonly IChangeset[] | null> {
    if (range.from < 0 || (range.to !== undefined && range.to < 0)) {
      throw new CollabError("INVALID_REQUEST", "Changeset range revisions cannot be negative");
    }

    // LEFT JOIN 在一次读取中区分非 active Unit（null）和 active Unit 的空区间（[]）。
    const rows = this._database
      .prepare(`
        SELECT c.payload
        FROM units u LEFT JOIN changesets c ON c.unit_id = u.unit_id
          AND c.revision > ?
          AND (? IS NULL OR c.revision <= ?)
        WHERE u.unit_id = ? AND u.deleted = 0
        ORDER BY c.revision ASC
      `)
      .all(range.from, range.to ?? null, range.to ?? null, unitID) as {
      payload: Uint8Array | null;
    }[];
    if (rows.length === 0) {
      return null;
    }
    return rows.flatMap((row) =>
      row.payload === null ? [] : [decodePayload<IChangeset>(row.payload)],
    );
  }

  async getSheetBlock(
    _ctx: DatabaseContext,
    unitID: string,
    blockID: string,
  ): Promise<ISheetBlock | null> {
    const row = this._database
      .prepare(`
        SELECT b.payload FROM sheet_blocks b JOIN units u ON u.unit_id = b.unit_id
        WHERE u.unit_id = ? AND u.deleted = 0 AND b.block_id = ?
      `)
      .get(unitID, blockID) as PayloadRow | undefined;
    return row ? decodePayload<ISheetBlock>(row.payload) : null;
  }

  async createUnit(
    _ctx: DatabaseContext,
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
        if (this._hasTombstone(record.unitID)) {
          throw new CollabError("INVALID_REQUEST", "A hard-deleted unit ID cannot be reused");
        }
        const existing = this._getStoredUnit(record.unitID);
        if (existing) {
          if (existing.deleted !== 0) {
            throw new CollabError("INVALID_REQUEST", "A deleted unit ID cannot be reused");
          }
          return { status: "already-exists", record: toUnitRecord(existing) };
        }

        this._database
          .prepare("INSERT INTO units (unit_id, type, head_revision) VALUES (?, ?, 1)")
          .run(record.unitID, record.type);
        // Commit the Unit, initial snapshot, and dependent blocks together; any failure rolls back.
        this._writeSnapshot(snapshot, sheetBlocks);
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
        // BEGIN IMMEDIATE acquires the write lock before checking the head to prevent concurrent writes.
        // The transaction callback must run synchronously so all writes complete before commit.
        // CAS compares only revision; the Service deduplicates {sid, reqId} using consecutive history.
        if (unit.headRevision !== expectedHeadRevision) {
          return {
            status: "revision-mismatch",
            actualHeadRevision: unit.headRevision,
          };
        }
        const payload = encodePayload(changeset);
        this._database
          .prepare("INSERT INTO changesets (unit_id, revision, payload) VALUES (?, ?, ?)")
          .run(changeset.unitID, changeset.revision, payload);
        this._database
          .prepare("UPDATE units SET head_revision = ? WHERE unit_id = ?")
          .run(changeset.revision, changeset.unitID);
        return {
          status: "committed",
          changeset: decodePayload<IChangeset>(payload),
          headRevision: changeset.revision,
        };
      })
      .immediate();
  }

  async saveSnapshot(_ctx: DatabaseContext, input: SaveSnapshotInput): Promise<void> {
    this._database
      .transaction(() => {
        const { snapshot, sheetBlocks = [] } = input;
        const unit = this._requireActiveUnit(snapshot.unitID);
        if (snapshot.type !== unit.type || snapshot.rev < 1 || snapshot.rev > unit.headRevision) {
          throw new CollabError("INVALID_REQUEST", "Snapshot does not match the stored unit head");
        }
        this._writeSnapshot(snapshot, sheetBlocks);
      })
      .immediate();
  }

  async deleteUnits(
    _ctx: DatabaseContext,
    input: DeleteUnitsDatabaseInput,
  ): Promise<DeleteUnitsDatabaseResult> {
    return this._database
      .transaction((): DeleteUnitsDatabaseResult => {
        // Validate all distinct Units first; a missing ID must leave the entire batch unchanged.
        const units: DeleteUnitsDatabaseResult["units"] = [...new Set(input.unitIDs)].map(
          (unitID) => {
            const unit = this._getStoredUnit(unitID);
            if (!unit) {
              if (input.hardDelete && this._hasTombstone(unitID)) {
                return { unitID, status: "already-hard-deleted" };
              }
              throw new CollabError("UNIT_NOT_FOUND", "Cannot delete a missing unit");
            }
            return {
              unitID,
              status: input.hardDelete
                ? "hard-deleted"
                : unit.deleted === 0
                  ? "soft-deleted"
                  : "already-soft-deleted",
            };
          },
        );

        for (const unit of units) {
          if (unit.status === "hard-deleted") {
            // Cascade-delete related content; retain a tombstone to prevent recreating the Unit.
            this._database.prepare("INSERT INTO tombstones (unit_id) VALUES (?)").run(unit.unitID);
            this._database.prepare("DELETE FROM units WHERE unit_id = ?").run(unit.unitID);
          } else if (unit.status === "soft-deleted") {
            this._database
              .prepare("UPDATE units SET deleted = 1 WHERE unit_id = ?")
              .run(unit.unitID);
          }
        }
        return { units };
      })
      .immediate();
  }

  async recoverUnits(
    _ctx: DatabaseContext,
    input: RecoverUnitsDatabaseInput,
  ): Promise<RecoverUnitsDatabaseResult> {
    return this._database
      .transaction((): RecoverUnitsDatabaseResult => {
        const units: RecoverUnitsDatabaseResult["units"] = [...new Set(input.unitIDs)].map(
          (unitID) => {
            if (this._hasTombstone(unitID)) {
              throw new CollabError("INVALID_REQUEST", "A hard-deleted unit cannot be recovered");
            }
            const unit = this._getStoredUnit(unitID);
            if (!unit) {
              throw new CollabError("UNIT_NOT_FOUND", "Cannot recover a missing unit");
            }
            return {
              unitID,
              status: unit.deleted === 0 ? "already-active" : "recovered",
            };
          },
        );

        for (const unit of units) {
          if (unit.status === "recovered") {
            this._database
              .prepare("UPDATE units SET deleted = 0 WHERE unit_id = ?")
              .run(unit.unitID);
          }
        }
        return { units };
      })
      .immediate();
  }

  /** Call after all Services using this Adapter have stopped; repeated calls are safe. */
  async dispose(): Promise<void> {
    if (this._database.open) {
      this._database.close();
    }
  }

  private _getStoredUnit(unitID: string): UnitRow | undefined {
    return this._database
      .prepare(`
        SELECT unit_id AS unitID, type, head_revision AS headRevision, deleted
        FROM units WHERE unit_id = ?
      `)
      .get(unitID) as UnitRow | undefined;
  }

  private _requireActiveUnit(unitID: string): UnitRow {
    const unit = this._getStoredUnit(unitID);
    if (!unit || unit.deleted !== 0) {
      throw new CollabError("UNIT_NOT_FOUND", "Unit is not active");
    }
    return unit;
  }

  private _hasTombstone(unitID: string): boolean {
    return Boolean(
      this._database.prepare("SELECT 1 FROM tombstones WHERE unit_id = ?").get(unitID),
    );
  }

  private _writeSnapshot(snapshot: ISnapshot, sheetBlocks: readonly ISheetBlock[]): void {
    // Call only within a write transaction so a snapshot and its referenced blocks become visible together.
    const writeBlock = this._database.prepare(`
      INSERT INTO sheet_blocks (unit_id, block_id, payload) VALUES (?, ?, ?)
      ON CONFLICT (unit_id, block_id) DO UPDATE SET payload = excluded.payload
    `);
    for (const block of sheetBlocks) {
      writeBlock.run(snapshot.unitID, block.id, encodePayload(block));
    }
    this._database
      .prepare(`
        INSERT INTO snapshots (unit_id, revision, payload) VALUES (?, ?, ?)
        ON CONFLICT (unit_id, revision) DO UPDATE SET payload = excluded.payload
      `)
      .run(snapshot.unitID, snapshot.rev, encodePayload(snapshot));
  }
}

function toUnitRecord(row: UnitRow): UnitRecord {
  return { unitID: row.unitID, type: row.type, headRevision: row.headRevision };
}

// MessagePack preserves complete protocol objects and nested Uint8Array values without field-specific conversions.
function encodePayload(value: ISnapshot | IChangeset | ISheetBlock): Uint8Array {
  // Omit unset object fields so MessagePack does not restore undefined values as null.
  return encode(value, { ignoreUndefined: true });
}

function decodePayload<T>(payload: Uint8Array): T {
  // Decode a plain Uint8Array view so binary fields use the Uint8Array type expected by the protocol.
  return decode(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)) as T;
}
