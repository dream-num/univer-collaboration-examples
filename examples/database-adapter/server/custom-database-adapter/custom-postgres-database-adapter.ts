import { Buffer } from "node:buffer";
import { Decoder, Encoder } from "@msgpack/msgpack";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
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

interface PayloadRow {
  readonly payload: Buffer;
}

interface UnitRecordRow extends Omit<UnitRecord, "createdAt"> {
  readonly createdAt: string | number;
}

interface UnitRow extends UnitRecordRow {
  readonly deletedStatus: "soft" | "hard" | null;
}

/** A custom collaboration database adapter backed by PostgreSQL. */
export class CustomPostgresDatabaseAdapter implements IDatabaseAdapter {
  private readonly _encoder = new Encoder({ ignoreUndefined: true });
  private readonly _decoder = new Decoder();
  private _closing?: Promise<void>;

  constructor(private readonly _pool: Pool) {}

  static async createTables(pool: Pool): Promise<void> {
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS collaboration;
      CREATE TABLE IF NOT EXISTS collaboration.units (
        unit_id TEXT PRIMARY KEY,
        type INTEGER NOT NULL,
        head_revision INTEGER NOT NULL CHECK (head_revision >= 1),
        creator_id TEXT NOT NULL,
        created_at_ms BIGINT NOT NULL,
        deleted_at_ms BIGINT,
        deleted_status TEXT CHECK (deleted_status IN ('soft', 'hard')),
        CHECK ((deleted_status IS NULL) = (deleted_at_ms IS NULL))
      );
      CREATE TABLE IF NOT EXISTS collaboration.snapshots (
        unit_id TEXT NOT NULL REFERENCES collaboration.units(unit_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK (revision >= 1),
        payload BYTEA NOT NULL,
        PRIMARY KEY (unit_id, revision)
      );
      CREATE TABLE IF NOT EXISTS collaboration.changesets (
        unit_id TEXT NOT NULL REFERENCES collaboration.units(unit_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK (revision >= 2),
        created_at_ms BIGINT NOT NULL,
        payload BYTEA NOT NULL,
        PRIMARY KEY (unit_id, revision)
      );
      CREATE TABLE IF NOT EXISTS collaboration.sheet_blocks (
        unit_id TEXT NOT NULL REFERENCES collaboration.units(unit_id) ON DELETE CASCADE,
        block_id TEXT NOT NULL,
        payload BYTEA NOT NULL,
        PRIMARY KEY (unit_id, block_id)
      );
    `);
  }

  async getUnit(_ctx: DatabaseContext, unitID: string): Promise<UnitRecord | null> {
    const { rows } = await this._query<UnitRecordRow>("get_unit", `
      SELECT unit_id AS "unitID", type, head_revision AS "headRevision",
        creator_id AS "creatorID", created_at_ms AS "createdAt"
      FROM collaboration.units
      WHERE unit_id = $1 AND deleted_status IS NULL
    `, [unitID]);
    return rows[0] ? toUnitRecord(rows[0]) : null;
  }

  /** Reads the latest snapshot up to the specified revision, or the current head when omitted. */
  async getSnapshot(
    _ctx: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<ISnapshot | null> {
    const revision = options?.revision;
    if (revision !== undefined && revision < 0) {
      throw new CollabError("INVALID_REQUEST", "Snapshot revision cannot be negative");
    }

    const { rows } = revision === undefined
      ? await this._query<PayloadRow>("get_snapshot", `
      SELECT s.payload
      FROM collaboration.snapshots s
      JOIN collaboration.units u USING (unit_id)
      WHERE u.unit_id = $1 AND u.deleted_status IS NULL
        AND s.revision <= u.head_revision
      ORDER BY s.revision DESC
      LIMIT 1
    `, [unitID])
      : await this._query<PayloadRow>("get_snapshot_at_revision", `
      SELECT s.payload
      FROM collaboration.snapshots s
      JOIN collaboration.units u USING (unit_id)
      WHERE u.unit_id = $1 AND u.deleted_status IS NULL
        AND s.revision <= u.head_revision
        AND s.revision <= $2
      ORDER BY s.revision DESC
      LIMIT 1
    `, [unitID, revision]);
    return rows[0] ? this._decode<ISnapshot>(rows[0].payload) : null;
  }

  /** Reads metadata using the same criteria as getSnapshot, without loading its payload. */
  async getSnapshotInfo(
    _ctx: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<SnapshotInfo | null> {
    const revision = options?.revision;
    if (revision !== undefined && revision < 0) {
      throw new CollabError("INVALID_REQUEST", "Snapshot revision cannot be negative");
    }

    const { rows } = revision === undefined
      ? await this._query<SnapshotInfo>("get_snapshot_info", `
      SELECT s.unit_id AS "unitID", u.type, s.revision AS rev
      FROM collaboration.snapshots s
      JOIN collaboration.units u USING (unit_id)
      WHERE u.unit_id = $1 AND u.deleted_status IS NULL
        AND s.revision <= u.head_revision
      ORDER BY s.revision DESC
      LIMIT 1
    `, [unitID])
      : await this._query<SnapshotInfo>("get_snapshot_info_at_revision", `
      SELECT s.unit_id AS "unitID", u.type, s.revision AS rev
      FROM collaboration.snapshots s
      JOIN collaboration.units u USING (unit_id)
      WHERE u.unit_id = $1 AND u.deleted_status IS NULL
        AND s.revision <= u.head_revision
        AND s.revision <= $2
      ORDER BY s.revision DESC
      LIMIT 1
    `, [unitID, revision]);
    return rows[0] ?? null;
  }

  /** Reads changesets in (from, to]; omitting to leaves the range unbounded. */
  async getChangesets(
    _ctx: DatabaseContext,
    unitID: string,
    range: { readonly from: number; readonly to?: number },
  ): Promise<readonly IChangeset[] | null> {
    if (range.from < 0 || (range.to !== undefined && range.to < 0)) {
      throw new CollabError("INVALID_REQUEST", "Changeset range revisions cannot be negative");
    }

    // LEFT JOIN distinguishes an inaccessible Unit (null) from a Unit with no matching history ([]).
    const { rows } = range.to === undefined
      ? await this._query<{ payload: Buffer | null }>("get_changesets", `
        SELECT c.payload
        FROM collaboration.units u
        LEFT JOIN collaboration.changesets c ON c.unit_id = u.unit_id
          AND c.revision > $2
        WHERE u.unit_id = $1 AND u.deleted_status IS NULL
        ORDER BY c.revision
      `, [unitID, range.from])
      : await this._query<{ payload: Buffer | null }>("get_changesets_in_range", `
        SELECT c.payload
        FROM collaboration.units u
        LEFT JOIN collaboration.changesets c ON c.unit_id = u.unit_id
          AND c.revision > $2
          AND c.revision <= $3
        WHERE u.unit_id = $1 AND u.deleted_status IS NULL
        ORDER BY c.revision
      `, [unitID, range.from, range.to]);
    if (rows.length === 0) return null;

    const changesets: IChangeset[] = [];
    for (const row of rows) {
      if (row.payload !== null) changesets.push(this._decode<IChangeset>(row.payload));
    }
    return changesets;
  }

  async getSheetBlock(
    _ctx: DatabaseContext,
    unitID: string,
    blockID: string,
  ): Promise<ISheetBlock | null> {
    const { rows } = await this._query<PayloadRow>("get_sheet_block", `
      SELECT b.payload
      FROM collaboration.sheet_blocks b
      JOIN collaboration.units u USING (unit_id)
      WHERE u.unit_id = $1 AND u.deleted_status IS NULL AND b.block_id = $2
    `, [unitID, blockID]);
    return rows[0] ? this._decode<ISheetBlock>(rows[0].payload) : null;
  }

  /** Atomically creates a Unit at revision 1 with its snapshot and blocks. */
  async createUnit(
    ctx: DatabaseContext,
    input: CreateUnitDatabaseInput,
  ): Promise<CreateUnitDatabaseResult> {
    const { record, snapshot, sheetBlocks = [] } = input;
    if (
      record.headRevision !== 1 || snapshot.rev !== 1 ||
      snapshot.unitID !== record.unitID || snapshot.type !== record.type
    ) {
      throw new CollabError("INVALID_REQUEST", "Initial record and snapshot must match at revision 1");
    }

    const blocks = latestBlocks(sheetBlocks);
    return this._transaction(async (client) => {
      if (blocks.length <= MAX_BLOCKS_PER_STATEMENT) {
        // One statement creates the Unit, its blocks and its snapshot; each block is a scalar parameter.
        const values: unknown[] = [record.unitID, record.type, this._encode(snapshot), ctx.userID, Date.now()];
        const result = await this._query(null, `
          WITH created AS (
            INSERT INTO collaboration.units (unit_id, type, head_revision, creator_id, created_at_ms)
            VALUES ($1, $2, 1, $4, $5)
            ON CONFLICT (unit_id) DO NOTHING
            RETURNING unit_id
          ), saved_blocks AS (
            INSERT INTO collaboration.sheet_blocks (unit_id, block_id, payload)
            SELECT u.unit_id, b.id, b.payload
            FROM created u
            CROSS JOIN ${this._blockRows(blocks, values)} AS b(id, payload)
          )
          INSERT INTO collaboration.snapshots (unit_id, revision, payload)
          SELECT unit_id, 1, $3 FROM created
        `, values, client);
        if (result.rowCount) return { status: "created", record: { ...record } };
      } else {
        // Rare: more blocks than one statement can carry. The transaction still publishes everything together.
        const created = await this._query("create_unit", `
          INSERT INTO collaboration.units (unit_id, type, head_revision, creator_id, created_at_ms)
          VALUES ($1, $2, 1, $3, $4)
          ON CONFLICT (unit_id) DO NOTHING
          RETURNING unit_id
        `, [record.unitID, record.type, ctx.userID, Date.now()], client);
        if (created.rowCount) {
          await this._insertBlocks(client, record.unitID, blocks, false);
          await this._query("create_snapshot", `
            INSERT INTO collaboration.snapshots (unit_id, revision, payload)
            VALUES ($1, 1, $2)
          `, [record.unitID, this._encode(snapshot)], client);
          return { status: "created", record: { ...record } };
        }
      }

      // After a conflict, reads with a fresh statement snapshot and coordinates with deletion and recovery using a row lock.
      const [unit] = await this._lockUnits(client, [record.unitID]);
      if (unit!.deletedStatus !== null) {
        throw new CollabError("INVALID_REQUEST", "A deleted unit ID cannot be reused");
      }
      return { status: "already-exists", record: toUnitRecord(unit!) };
    });
  }

  async commitChangeset(
    ctx: SubmitDatabaseContext,
    input: CommitChangesetInput,
  ): Promise<CommitChangesetResult> {
    const { changeset } = input;
    const createdAt = Date.now();
    const committedChangeset = {
      ...changeset,
      createTime: Math.floor(createdAt / 1000),
    };
    // UPDATE checks the revision under a row lock; a failed history insert also rolls back the head update.
    const result = await this._query("commit_changeset", `
      WITH updated_unit AS (
        UPDATE collaboration.units
        SET head_revision = $2
        WHERE unit_id = $1 AND deleted_status IS NULL AND head_revision = $2::integer - 1
        RETURNING unit_id, head_revision
      )
      INSERT INTO collaboration.changesets (unit_id, revision, created_at_ms, payload)
      SELECT unit_id, head_revision, $3, $4 FROM updated_unit
      RETURNING revision
    `, [changeset.unitID, changeset.revision, createdAt, this._encode(committedChangeset)]);
    if (result.rowCount) {
      return { status: "committed", changeset: committedChangeset, headRevision: changeset.revision };
    }

    // Reads the head after a competing commit using a fresh statement snapshot.
    const unit = await this.getUnit(ctx, changeset.unitID);
    if (!unit) throw new CollabError("UNIT_NOT_FOUND", "Unit is not active");
    return { status: "revision-mismatch", actualHeadRevision: unit.headRevision };
  }

  /** Saves snapshot metadata and the supplied blocks. */
  async saveSnapshot(_ctx: DatabaseContext, input: SaveSnapshotInput): Promise<void> {
    const { snapshot } = input;
    const blocks = latestBlocks(input.sheetBlocks ?? []);
    if (blocks.length > MAX_BLOCKS_PER_STATEMENT) return this._saveSnapshotInChunks(snapshot, blocks);
    // Validates the current row returned by FOR UPDATE; writes only apply to a Unit that passes validation.
    // One statement, so the snapshot row is published together with every block it references.
    const values: unknown[] = [snapshot.unitID, snapshot.type, snapshot.rev, this._encode(snapshot)];
    const { rows } = await this._query<{ deletedStatus: UnitRow["deletedStatus"]; saved: boolean }>(null, `
      WITH locked_unit AS MATERIALIZED (
        SELECT unit_id, type, head_revision, deleted_status
        FROM collaboration.units
        WHERE unit_id = $1
        FOR UPDATE
      ), valid_unit AS (
        SELECT unit_id FROM locked_unit
        WHERE deleted_status IS NULL AND type = $2 AND $3::integer BETWEEN 1 AND head_revision
      ), saved_blocks AS (
        INSERT INTO collaboration.sheet_blocks (unit_id, block_id, payload)
        SELECT u.unit_id, b.id, b.payload
        FROM valid_unit u
        CROSS JOIN ${this._blockRows(blocks, values)} AS b(id, payload)
        ON CONFLICT (unit_id, block_id) DO UPDATE SET payload = excluded.payload
      ), saved_snapshot AS (
        INSERT INTO collaboration.snapshots (unit_id, revision, payload)
        SELECT unit_id, $3, $4 FROM valid_unit
        ON CONFLICT (unit_id, revision) DO UPDATE SET payload = excluded.payload
        RETURNING revision
      )
      SELECT deleted_status AS "deletedStatus", EXISTS (SELECT 1 FROM saved_snapshot) AS saved FROM locked_unit
    `, values);
    const unit = rows[0];
    if (!unit || unit.deletedStatus !== null) throw new CollabError("UNIT_NOT_FOUND", "Unit is not active");
    if (!unit.saved) {
      throw new CollabError("INVALID_REQUEST", "Snapshot does not match the stored unit head");
    }
  }

  /** Rare: more blocks than one statement can carry. Same checks and writes, split over one transaction. */
  private async _saveSnapshotInChunks(snapshot: ISnapshot, blocks: readonly ISheetBlock[]): Promise<void> {
    await this._transaction(async (client) => {
      const [unit] = await this._lockUnits(client, [snapshot.unitID]);
      if (!unit || unit.deletedStatus !== null) throw new CollabError("UNIT_NOT_FOUND", "Unit is not active");
      if (unit.type !== snapshot.type || snapshot.rev < 1 || snapshot.rev > unit.headRevision) {
        throw new CollabError("INVALID_REQUEST", "Snapshot does not match the stored unit head");
      }
      await this._insertBlocks(client, snapshot.unitID, blocks, true);
      await this._query("save_snapshot_row", `
        INSERT INTO collaboration.snapshots (unit_id, revision, payload)
        VALUES ($1, $2, $3)
        ON CONFLICT (unit_id, revision) DO UPDATE SET payload = excluded.payload
      `, [snapshot.unitID, snapshot.rev, this._encode(snapshot)], client);
    });
  }

  /** Atomically deletes the specified Units; hard deletion retains Unit rows to prevent ID reuse. */
  async deleteUnits(
    _ctx: DatabaseContext,
    input: DeleteUnitsDatabaseInput,
  ): Promise<DeleteUnitsDatabaseResult> {
    const ids = input.unitIDs;
    if (ids.length === 0) return { units: [] };

    return this._transaction(async (client) => {
      const states = await this._lockUnits(client, ids);
      const units = states.map((unit): DeleteUnitsDatabaseResult["units"][number] => {
        if (!unit || (unit.deletedStatus === "hard" && !input.hardDelete)) {
          throw new CollabError("UNIT_NOT_FOUND", "Cannot delete a missing unit");
        }
        return {
          unitID: unit.unitID,
          status: input.hardDelete
            ? unit.deletedStatus === "hard" ? "already-hard-deleted" : "hard-deleted"
            : unit.deletedStatus === "soft" ? "already-soft-deleted" : "soft-deleted",
        };
      });

      const deletedAt = Date.now();
      if (input.hardDelete) {
        await this._query("hard_delete_units", `
          WITH deleted_units AS (
            UPDATE collaboration.units
            SET deleted_at_ms = $2, deleted_status = 'hard'
            WHERE unit_id = ANY($1::text[]) AND deleted_status IS DISTINCT FROM 'hard'
            RETURNING unit_id
          ), removed_snapshots AS (
            DELETE FROM collaboration.snapshots
            WHERE unit_id IN (SELECT unit_id FROM deleted_units)
          ), removed_blocks AS (
            DELETE FROM collaboration.sheet_blocks
            WHERE unit_id IN (SELECT unit_id FROM deleted_units)
          )
          DELETE FROM collaboration.changesets
          WHERE unit_id IN (SELECT unit_id FROM deleted_units)
        `, [ids, deletedAt], client);
      } else {
        await this._query("soft_delete_units", `
          UPDATE collaboration.units
          SET deleted_at_ms = $2, deleted_status = 'soft'
          WHERE unit_id = ANY($1::text[]) AND deleted_status IS NULL
        `, [ids, deletedAt], client);
      }
      return { units };
    });
  }

  /** Atomically restores soft-deleted Units; hard-deleted IDs cannot be recovered. */
  async recoverUnits(
    _ctx: DatabaseContext,
    input: RecoverUnitsDatabaseInput,
  ): Promise<RecoverUnitsDatabaseResult> {
    const ids = input.unitIDs;
    if (ids.length === 0) return { units: [] };

    return this._transaction(async (client) => {
      const states = await this._lockUnits(client, ids);
      const units = states.map((unit): RecoverUnitsDatabaseResult["units"][number] => {
        if (!unit) throw new CollabError("UNIT_NOT_FOUND", "Cannot recover a missing unit");
        if (unit.deletedStatus === "hard") {
          throw new CollabError("INVALID_REQUEST", "A hard-deleted unit cannot be recovered");
        }
        return { unitID: unit.unitID, status: unit.deletedStatus === "soft" ? "recovered" : "already-active" };
      });

      await this._query("recover_units", `
        UPDATE collaboration.units SET deleted_at_ms = NULL, deleted_status = NULL
        WHERE unit_id = ANY($1::text[]) AND deleted_status = 'soft'
      `, [ids], client);
      return { units };
    });
  }

  dispose(): Promise<void> {
    return this._closing ??= this._pool.end();
  }

  private async _transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this._pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        releaseError = rollbackError instanceof Error ? rollbackError : new Error("Rollback failed");
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }

  private async _lockUnits(client: PoolClient, unitIDs: readonly string[]): Promise<(UnitRow | undefined)[]> {
    // Acquires row locks in unit_id order to avoid deadlocks between batches with different input orders.
    const { rows } = await this._query<UnitRow>("lock_units", `
      SELECT unit_id AS "unitID", type, head_revision AS "headRevision",
        creator_id AS "creatorID", created_at_ms AS "createdAt",
        deleted_status AS "deletedStatus"
      FROM collaboration.units
      WHERE unit_id = ANY($1::text[])
      ORDER BY unit_id
      FOR UPDATE
    `, [unitIDs], client);
    // Preserves the input unitIDs order, returning undefined for missing Units.
    const units = new Map(rows.map(unit => [unit.unitID, unit]));
    return unitIDs.map(unitID => units.get(unitID));
  }

  /** `name` null runs an unnamed statement; used where the statement text depends on the block count. */
  private _query<R extends QueryResultRow = QueryResultRow>(
    name: string | null,
    text: string,
    values: unknown[] = [],
    client?: PoolClient,
  ): Promise<QueryResult<R>> {
    const query = name === null ? { text, values } : { name: `collaboration-${name}`, text, values };
    return (client ?? this._pool).query<R>(query);
  }

  private _encode(value: IChangeset | ISnapshot | ISheetBlock): Buffer {
    const bytes = this._encoder.encode(value);
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private _decode<T>(payload: Buffer): T {
    // Uses a plain byte view so protocol binary fields decode as Uint8Array.
    const bytes = new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
    return this._decoder.decode(bytes) as T;
  }

  /**
   * Renders blocks as an inline VALUES relation and appends two scalar parameters per block, so every
   * payload travels as a binary `bytea` parameter. `pg` has no binary encoding for a `bytea[]` parameter:
   * it would hex-encode every byte into a text array literal on the event loop and the server would parse
   * it back, doubling the bytes on the wire and costing hundreds of milliseconds per snapshot of a large
   * workbook.
   */
  private _blockRows(blocks: readonly ISheetBlock[], values: unknown[]): string {
    if (blocks.length === 0) return "(SELECT NULL::text, NULL::bytea WHERE false)";
    const rows = blocks.map((block) => {
      values.push(block.id, this._encode(block));
      return `($${values.length - 1}::text, $${values.length}::bytea)`;
    });
    return `(VALUES ${rows.join(", ")})`;
  }

  private async _insertBlocks(
    client: PoolClient,
    unitID: string,
    blocks: readonly ISheetBlock[],
    upsert: boolean,
  ): Promise<void> {
    for (let start = 0; start < blocks.length; start += MAX_BLOCKS_PER_STATEMENT) {
      const values: unknown[] = [unitID];
      await this._query(null, `
        INSERT INTO collaboration.sheet_blocks (unit_id, block_id, payload)
        SELECT $1::text, b.id, b.payload
        FROM ${this._blockRows(blocks.slice(start, start + MAX_BLOCKS_PER_STATEMENT), values)} AS b(id, payload)
        ${upsert ? "ON CONFLICT (unit_id, block_id) DO UPDATE SET payload = excluded.payload" : ""}
      `, values, client);
    }
  }
}

/** Blocks per statement: two parameters each plus a few fixed ones stay well below PostgreSQL's 65535-parameter limit. */
const MAX_BLOCKS_PER_STATEMENT = 30_000;

/** Keeps the last block for each duplicate ID, matching sequential upserts. */
function latestBlocks(sheetBlocks: readonly ISheetBlock[]): ISheetBlock[] {
  return [...new Map(sheetBlocks.map(block => [block.id, block])).values()];
}

function toUnitRecord(unit: UnitRecordRow): UnitRecord {
  return {
    unitID: unit.unitID,
    type: unit.type,
    headRevision: unit.headRevision,
    creatorID: unit.creatorID,
    createdAt: Number(unit.createdAt),
  };
}
