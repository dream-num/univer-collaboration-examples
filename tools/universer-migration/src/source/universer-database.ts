// Read-only SQL access to the Universer PostgreSQL schema. Only queries live here; turning rows into
// protocol objects is done by the builders. The queries follow Universer's own reads
// (internal/biz/snapshot.go, internal/data/*.go) and add `deleted_at IS NULL` where its GORM models do.
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import { UniverType } from "@univerjs/protocol";
import type { SourceUnitRow } from "../model.js";

const TIMESTAMP_WITHOUT_TIME_ZONE_OID = 1114;

/**
 * Creates the source pool. Columns of type `timestamp` (no zone) are returned as strings so that
 * `toMs` reads them as UTC; the pg default would apply the local time zone of the migration host.
 */
export function createUniverserPool(connectionString: string, max: number): Pool {
  return new pg.Pool({
    connectionString,
    max,
    types: {
      getTypeParser: ((oid: number, format?: string) =>
        oid === TIMESTAMP_WITHOUT_TIME_ZONE_OID
          ? (value: string) => value
          : pg.types.getTypeParser(oid, format as "text")) as typeof pg.types.getTypeParser,
    },
  });
}

/** Columns this tool reads. The migration refuses to run when any of them is missing. */
const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  unit: ["unit_id", "type", "creator", "name", "created_at", "deleted_at", "purge_status", "customer_idempotency_key", "customer_meta_data"],
  workbook_top_snapshot: ["unit_id", "revision", "snapshot_id", "worksheets", "sheet_blocks", "resources", "original_meta", "deleted_at"],
  worksheet: ["unit_id", "snapshot_id", "sheet_id", "type", "name", "row_count", "column_count", "original_meta", "deleted_at"],
  sheet_block: ["block_id", "start_row", "end_row", "rows", "file_id", "deleted_at"],
  resource: ["resource_id", "name", "data", "deleted_at"],
  document_snapshot: ["unit_id", "revision", "resources", "original_meta", "deleted_at"],
  slide_snapshot: ["unit_id", "revision", "resources", "original_meta"],
  board_snapshot: ["unit_id", "revision", "resources", "original_meta"],
  pdf_snapshot: ["unit_id", "revision", "original_meta"],
  changeset: ["unit_id", "revision", "base_rev", "type", "user_id", "mutations", "sid", "req_id", "created_at", "deleted_at"],
  file_meta: ["file_id", "name", "size", "block_list", "source", "assign", "created_at", "deleted_at"],
  file_block: ["block_id", "object_key", "cipher_key"],
  unit_comment: ["unit_id", "thread_id", "reply_id", "user_id", "content", "mention", "solved", "created_at", "updated_at", "deleted_at"],
  unit_hard_delete_task: ["unit_id", "status"],
};

export interface WorkbookSnapshotRow {
  readonly revision: number;
  readonly snapshotID: string;
  readonly sheetOrder: readonly string[];
  readonly blockIDsBySheet: Readonly<Record<string, readonly string[]>>;
  readonly resourceIDs: readonly string[];
  readonly originalMeta: unknown;
}

export interface MetaSnapshotRow {
  readonly revision: number;
  readonly resourceIDs: readonly string[];
  readonly originalMeta: unknown;
}

export interface WorksheetRow {
  readonly sheetID: string;
  readonly type: number;
  readonly name: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly originalMeta: unknown;
}

export interface ResourceRow {
  readonly resourceID: string;
  readonly name: string;
  readonly data: string;
}

export interface BlockRow {
  readonly blockID: string;
  readonly startRow: number;
  readonly endRow: number;
  /** Inline cell data written by early Universer versions; `{}` when the block is in the bucket. */
  readonly rows: unknown;
  readonly objectKey: string | null;
  readonly cipherKey: string | null;
}

export interface ChangesetRow {
  readonly revision: number;
  readonly baseRev: number;
  readonly type: number;
  readonly userID: string;
  readonly mutations: unknown;
  readonly sid: string;
  readonly reqID: number;
  readonly createdAtMs: number;
}

export interface CommentRow {
  readonly threadID: string;
  readonly replyID: string;
  readonly userID: string;
  readonly content: string;
  readonly mention: unknown;
  readonly solved: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

export interface FileRow {
  readonly fileID: string;
  readonly name: string;
  readonly size: number;
  readonly source: number;
  readonly assign: string;
  readonly objectKey: string;
  readonly createdAtMs: number;
}

const META_SNAPSHOT_TABLES: Partial<Record<UniverType, { readonly table: string; readonly softDelete: boolean }>> = {
  [UniverType.UNIVER_DOC]: { table: "document_snapshot", softDelete: true },
  [UniverType.UNIVER_SLIDE]: { table: "slide_snapshot", softDelete: false },
  [UniverType.UNIVER_BOARD]: { table: "board_snapshot", softDelete: false },
  [UniverType.UNIVER_PDF]: { table: "pdf_snapshot", softDelete: false },
};

export class UniverserDatabase {
  constructor(private readonly _pool: Pool) {}

  /** Returns the missing `table.column` names; empty means the schema is supported. */
  async findMissingColumns(): Promise<string[]> {
    const { rows } = await this._pool.query<{ table_name: string; column_name: string }>(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'universer'",
    );
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    return Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
      columns.map((column) => `${table}.${column}`).filter((name) => !present.has(name)),
    );
  }

  async listUnits(unitIDs: readonly string[]): Promise<SourceUnitRow[]> {
    const filter = unitIDs.length ? "WHERE unit_id = ANY($1::text[])" : "";
    const { rows } = await this._pool.query(
      `SELECT unit_id, type, creator, name, created_at, deleted_at, purge_status,
              customer_idempotency_key, customer_meta_data
       FROM universer.unit ${filter} ORDER BY id`,
      unitIDs.length ? [unitIDs] : [],
    );
    return rows.map((row) => ({
      unitID: row.unit_id,
      type: Number(row.type) as UniverType,
      creator: row.creator ?? "",
      name: row.name ?? "",
      createdAtMs: toMs(row.created_at),
      deletedAtMs: row.deleted_at ? toMs(row.deleted_at) : null,
      purgeStatus: row.purge_status ?? "",
      customerIdempotencyKey: row.customer_idempotency_key ?? null,
      customerMetaData: row.customer_meta_data ?? "",
    }));
  }

  /** Units Universer has permanently deleted. Their data is gone; only the IDs are reported. */
  async listHardDeletedUnitIDs(): Promise<string[]> {
    const { rows } = await this._pool.query<{ unit_id: string }>(
      "SELECT DISTINCT unit_id FROM universer.unit_hard_delete_task ORDER BY unit_id",
    );
    return rows.map((row) => row.unit_id);
  }

  /** Runs `read` in one read-only REPEATABLE READ transaction so a Unit is read at one point in time. */
  async readConsistently<T>(read: (reader: UnitTablesReader) => Promise<T>): Promise<T> {
    const client = await this._pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await read(new UnitTablesReader(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Queries bound to one transaction. */
export class UnitTablesReader {
  constructor(private readonly _client: PoolClient) {}

  async workbookSnapshots(unitID: string): Promise<WorkbookSnapshotRow[]> {
    // Universer never deletes old snapshots; keep the newest row if a revision was written twice.
    const { rows } = await this._client.query(
      `SELECT DISTINCT ON (revision) revision, snapshot_id, worksheets, sheet_blocks, resources, original_meta
       FROM universer.workbook_top_snapshot
       WHERE unit_id = $1 AND deleted_at IS NULL
       ORDER BY revision, id DESC`,
      [unitID],
    );
    return rows.map((row) => ({
      revision: Number(row.revision),
      snapshotID: row.snapshot_id,
      sheetOrder: asStringArray(row.worksheets),
      blockIDsBySheet: asBlockMap(row.sheet_blocks),
      resourceIDs: asStringArray(row.resources),
      originalMeta: row.original_meta,
    }));
  }

  async metaSnapshots(unitID: string, type: UniverType): Promise<MetaSnapshotRow[]> {
    const table = META_SNAPSHOT_TABLES[type];
    if (!table) throw new Error(`Unit type ${type} has no meta snapshot table`);
    const hasResources = type !== UniverType.UNIVER_PDF;
    const { rows } = await this._client.query(
      `SELECT DISTINCT ON (revision) revision, ${hasResources ? "resources" : "'[]'::jsonb AS resources"}, original_meta
       FROM universer.${table.table}
       WHERE unit_id = $1 ${table.softDelete ? "AND deleted_at IS NULL" : ""}
       ORDER BY revision, id DESC`,
      [unitID],
    );
    return rows.map((row) => ({
      revision: Number(row.revision),
      resourceIDs: asStringArray(row.resources),
      originalMeta: row.original_meta,
    }));
  }

  async worksheets(unitID: string, snapshotID: string, sheetIDs: readonly string[]): Promise<WorksheetRow[]> {
    const { rows } = await this._client.query(
      `SELECT sheet_id, type, name, row_count, column_count, original_meta
       FROM universer.worksheet
       WHERE unit_id = $1 AND snapshot_id = $2 AND sheet_id = ANY($3::text[]) AND deleted_at IS NULL`,
      [unitID, snapshotID, sheetIDs],
    );
    return rows.map((row) => ({
      sheetID: row.sheet_id,
      type: Number(row.type),
      name: row.name ?? "",
      rowCount: Number(row.row_count),
      columnCount: Number(row.column_count),
      originalMeta: row.original_meta,
    }));
  }

  async resources(resourceIDs: readonly string[]): Promise<ResourceRow[]> {
    if (!resourceIDs.length) return [];
    const { rows } = await this._client.query(
      `SELECT resource_id, name, data FROM universer.resource
       WHERE resource_id = ANY($1::text[]) AND deleted_at IS NULL`,
      [resourceIDs],
    );
    return rows.map((row) => ({ resourceID: row.resource_id, name: row.name, data: row.data ?? "" }));
  }

  async blocks(blockIDs: readonly string[]): Promise<BlockRow[]> {
    if (!blockIDs.length) return [];
    // Universer reads only the first entry of `block_list` (biz/file.go GetFile).
    const { rows } = await this._client.query(
      `SELECT b.block_id, b.start_row, b.end_row, b.rows, fb.object_key, fb.cipher_key
       FROM universer.sheet_block b
       LEFT JOIN universer.file_meta f ON f.file_id = b.file_id AND b.file_id <> '' AND f.deleted_at IS NULL
       LEFT JOIN universer.file_block fb ON fb.block_id = f.block_list ->> 0
       WHERE b.block_id = ANY($1::text[]) AND b.deleted_at IS NULL`,
      [blockIDs],
    );
    return rows.map((row) => ({
      blockID: row.block_id,
      startRow: Number(row.start_row),
      endRow: Number(row.end_row),
      rows: row.rows,
      objectKey: row.object_key ?? null,
      cipherKey: row.cipher_key ?? null,
    }));
  }

  async changesets(unitID: string, afterRevision: number): Promise<ChangesetRow[]> {
    const { rows } = await this._client.query(
      `SELECT revision, base_rev, type, user_id, mutations, sid, req_id, created_at
       FROM universer.changeset
       WHERE unit_id = $1 AND revision > $2 AND deleted_at IS NULL
       ORDER BY revision`,
      [unitID, afterRevision],
    );
    return rows.map((row) => ({
      revision: Number(row.revision),
      baseRev: Number(row.base_rev),
      type: Number(row.type),
      userID: row.user_id ?? "",
      mutations: row.mutations,
      sid: row.sid ?? "",
      reqID: Number(row.req_id),
      createdAtMs: toMs(row.created_at),
    }));
  }

  async comments(unitID: string): Promise<CommentRow[]> {
    const { rows } = await this._client.query(
      `SELECT thread_id, reply_id, user_id, content, mention, solved, created_at, updated_at
       FROM universer.unit_comment
       WHERE unit_id = $1 AND deleted_at IS NULL
       ORDER BY created_at, id`,
      [unitID],
    );
    return rows.map((row) => ({
      threadID: row.thread_id,
      replyID: row.reply_id,
      userID: row.user_id ?? "",
      content: row.content ?? "",
      mention: row.mention,
      solved: Number(row.solved),
      createdAtMs: toMs(row.created_at),
      updatedAtMs: toMs(row.updated_at),
    }));
  }

  async files(fileIDs: readonly string[]): Promise<FileRow[]> {
    if (!fileIDs.length) return [];
    const { rows } = await this._client.query(
      `SELECT f.file_id, f.name, f.size, f.source, f.assign, f.created_at, fb.object_key
       FROM universer.file_meta f
       JOIN universer.file_block fb ON fb.block_id = f.block_list ->> 0
       WHERE f.file_id = ANY($1::text[]) AND f.deleted_at IS NULL`,
      [fileIDs],
    );
    return rows.map((row) => ({
      fileID: row.file_id,
      name: row.name ?? "",
      size: Number(row.size),
      source: Number(row.source),
      assign: row.assign ?? "",
      objectKey: row.object_key,
      createdAtMs: toMs(row.created_at),
    }));
  }
}

// `timestamp` columns without a zone (unit_comment) are read as UTC, matching how Universer writes them.
function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`).getTime();
  throw new Error(`Unexpected timestamp value: ${String(value)}`);
}

function asStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Expected a JSON array of IDs");
  return value.map(String);
}

function asBlockMap(value: unknown): Record<string, string[]> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object of block IDs");
  return Object.fromEntries(Object.entries(value).map(([sheetID, ids]) => [sheetID, asStringArray(ids)]));
}
