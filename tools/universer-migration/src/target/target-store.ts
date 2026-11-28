// All writes to the SDK database and bucket.
//
// Unit creation, snapshots and file records go through the adapters' public methods, which own the
// block objects, the block ledger and the file schema. Changesets, comments and the deleted state are
// written with SQL because the public methods replace their timestamps with the current time, and
// the migration keeps the original ones. Those statements depend on the storage format of
//   - `@univerjs-pro/collaboration-database-postgres-s3`, schema component `core-s3` version 1:
//     `collaboration.units` and `collaboration.changesets`, payload = MessagePack of the protocol
//     changeset without `metadata`, encoded with `ignoreUndefined: true`;
//   - `@univerjs-pro/collaboration-comment-database-postgres`, schema component `comment` version 1:
//     `collaboration.comments`, a root comment has `reply_id = thread_id`.
// `open()` refuses other versions.
import { randomUUID } from "node:crypto";
import { Encoder } from "@msgpack/msgpack";
import type { S3Client } from "@aws-sdk/client-s3";
import { PostgresCommentDatabaseAdapter } from "@univerjs-pro/collaboration-comment-database-postgres";
import { PostgresS3DatabaseAdapter } from "@univerjs-pro/collaboration-database-postgres-s3";
import { PostgresFileDatabaseAdapter } from "@univerjs-pro/collaboration-file-database-postgres";
import type { FileContext, FileRecord } from "@univerjs-pro/collaboration-file-service";
import type { DatabaseContext, UnitMetadata } from "@univerjs-pro/collaboration-service";
import type { ISheetBlock, ISnapshot } from "@univerjs/protocol";
import pg from "pg";
import type { Pool } from "pg";
import type { SourceChangeset, SourceComment, SourceFile, SourceUnitRow } from "../model.js";

const SUPPORTED_SCHEMA_VERSIONS: Readonly<Record<string, number>> = { "core-s3": 1, comment: 1 };
const CHANGESET_INSERT_BATCH = 200;
const MIGRATION_USER_ID = "universer-migration";

export interface TargetUnitState {
  readonly headRevision: number;
  readonly deletedStatus: "soft" | "hard" | null;
  /** Highest stored snapshot revision. */
  readonly snapshotRevision: number;
}

export interface TargetStoreOptions {
  readonly databaseUrl: string;
  readonly s3Client: S3Client;
  readonly bucket: string;
  readonly blockPrefix?: string;
  readonly poolSize: number;
}

export class TargetStore {
  private readonly _encoder = new Encoder({ ignoreUndefined: true });

  private constructor(
    private readonly _pool: Pool,
    private readonly _core: PostgresS3DatabaseAdapter,
    private readonly _files: PostgresFileDatabaseAdapter,
  ) {}

  /** Creates the SDK schemas on first use and checks the versions the SQL writes depend on. */
  static async open(options: TargetStoreOptions): Promise<TargetStore> {
    const pool = new pg.Pool({ connectionString: options.databaseUrl, max: options.poolSize });
    try {
      const core = await PostgresS3DatabaseAdapter.create({
        pool,
        s3: {
          client: options.s3Client,
          bucket: options.bucket,
          ...(options.blockPrefix ? { prefix: options.blockPrefix } : {}),
        },
      });
      await PostgresCommentDatabaseAdapter.create({ pool });
      const files = await PostgresFileDatabaseAdapter.create({ pool });
      const store = new TargetStore(pool, core, files);
      await store._assertSchemaVersions();
      return store;
    } catch (error) {
      await pool.end();
      throw error;
    }
  }

  /** The core adapter, for verification reads. */
  get core(): PostgresS3DatabaseAdapter {
    return this._core;
  }

  async close(): Promise<void> {
    await this._pool.end();
  }

  async getUnitState(unitID: string): Promise<TargetUnitState | null> {
    const { rows } = await this._pool.query(
      `SELECT u.head_revision, u.deleted_status,
              (SELECT max(revision) FROM collaboration.snapshots s WHERE s.unit_id = u.unit_id) AS snapshot_revision
       FROM collaboration.units u WHERE u.unit_id = $1`,
      [unitID],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      headRevision: Number(row.head_revision),
      deletedStatus: row.deleted_status ?? null,
      snapshotRevision: Number(row.snapshot_revision ?? 0),
    };
  }

  /** Creates the Unit with its revision 1 snapshot. The original creator and creation time are kept. */
  async createUnit(
    unit: SourceUnitRow,
    creatorID: string,
    metadata: UnitMetadata,
    snapshot: ISnapshot,
    sheetBlocks: readonly ISheetBlock[],
  ): Promise<void> {
    const result = await this._core.createUnit(context({ unitID: unit.unitID, type: unit.type }), {
      record: {
        unitID: unit.unitID,
        type: unit.type,
        headRevision: 1,
        creatorID,
        createdAt: unit.createdAtMs,
        metadata,
      },
      snapshot,
      sheetBlocks,
    });
    if (result.status !== "created") throw new Error("Unit already exists in the target");
  }

  /**
   * Appends changesets after `expectedHead` in one transaction and moves the head, with the original
   * creation times. Fails without writing when the target head is not `expectedHead`.
   */
  async appendChangesets(
    unitID: string,
    expectedHead: number,
    changesets: readonly SourceChangeset[],
    metadata: UnitMetadata,
  ): Promise<void> {
    if (!changesets.length) return;
    const client = await this._pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT head_revision FROM collaboration.units WHERE unit_id = $1 AND deleted_status IS NULL FOR UPDATE",
        [unitID],
      );
      const head = rows[0] ? Number(rows[0].head_revision) : null;
      if (head !== expectedHead) {
        throw new Error(`Target head is ${head ?? "missing"}, expected ${expectedHead}`);
      }
      for (let start = 0; start < changesets.length; start += CHANGESET_INSERT_BATCH) {
        await this._insertChangesets(client, unitID, changesets.slice(start, start + CHANGESET_INSERT_BATCH));
      }
      const last = changesets.at(-1) as SourceChangeset;
      await client.query("UPDATE collaboration.units SET head_revision = $2, metadata = $3::jsonb WHERE unit_id = $1", [
        unitID,
        last.record.revision,
        JSON.stringify(metadata),
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async saveSnapshot(snapshot: ISnapshot, sheetBlocks: readonly ISheetBlock[]): Promise<void> {
    await this._core.saveSnapshot(context({ unitID: snapshot.unitID, type: snapshot.type, revision: snapshot.rev }), {
      snapshot,
      sheetBlocks,
    });
  }

  /** Inserts comments that are not stored yet, keeping their times. Replies take the root's state. */
  async insertComments(unitID: string, comments: readonly SourceComment[]): Promise<number> {
    const solvedByThread = new Map(
      comments.filter((comment) => comment.replyID === comment.threadID).map((root) => [root.threadID, root.solved]),
    );
    let inserted = 0;
    for (const comment of comments) {
      const result = await this._pool.query(
        `INSERT INTO collaboration.comments
           (unit_id, thread_id, reply_id, author_user_id, content, mentions, solved, created_at, updated_at, generation)
         VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10)
         ON CONFLICT (unit_id, reply_id) DO NOTHING`,
        [
          unitID,
          comment.threadID,
          comment.replyID,
          comment.authorUserID,
          comment.content,
          comment.mentions,
          solvedByThread.get(comment.threadID) ?? comment.solved,
          comment.createdAtMs,
          comment.updatedAtMs,
          randomUUID(),
        ],
      );
      inserted += result.rowCount ?? 0;
    }
    return inserted;
  }

  /**
   * Registers files in place: the SDK record keeps the Universer file ID and points at the existing
   * object, so snapshots need no rewriting and no object is copied. The SDK file service must use the
   * Universer bucket.
   */
  async registerFiles(files: readonly SourceFile[]): Promise<number> {
    let registered = 0;
    for (const file of files) {
      const ctx = fileContext({ fileID: file.fileID });
      if (await this._files.get(file.fileID, ctx)) continue;
      const record: FileRecord = {
        fileID: file.fileID,
        name: file.name,
        size: file.size,
        contentType: contentTypeOf(file.name),
        source: file.source,
        assign: file.assign,
        blobKey: file.objectKey,
        createdAt: file.createdAtMs,
      };
      await this._files.create(record, ctx);
      registered += 1;
    }
    return registered;
  }

  /** Sets or clears the soft-deleted state with the original deletion time. Hard deletes are never touched. */
  async setSoftDeleted(unitID: string, deletedAtMs: number | null): Promise<void> {
    await this._pool.query(
      `UPDATE collaboration.units
       SET deleted_status = $2, deleted_at_ms = $3
       WHERE unit_id = $1 AND deleted_status IS DISTINCT FROM 'hard'`,
      [unitID, deletedAtMs === null ? null : "soft", deletedAtMs],
    );
  }

  private async _insertChangesets(client: pg.PoolClient, unitID: string, changesets: readonly SourceChangeset[]): Promise<void> {
    const values: unknown[] = [];
    const tuples = changesets.map(({ record, createdAtMs }, index) => {
      // Same layout as the adapter's commitChangeset: payload without metadata, createTime in seconds,
      // created_at_ms in milliseconds.
      const { metadata, ...protocolChangeset } = record;
      const base = index * 8;
      values.push(
        unitID,
        record.revision,
        record.baseRev,
        record.sid ?? "",
        record.reqId ?? 1,
        createdAtMs,
        Buffer.from(this._encoder.encode(protocolChangeset)),
        JSON.stringify(metadata),
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb)`;
    });
    await client.query(
      `INSERT INTO collaboration.changesets
         (unit_id, revision, base_revision, sid, req_id, created_at_ms, payload, metadata)
       VALUES ${tuples.join(", ")}`,
      values,
    );
  }

  private async _assertSchemaVersions(): Promise<void> {
    const { rows } = await this._pool.query<{ component: string; version: number }>(
      "SELECT component, version FROM collaboration.schema_versions",
    );
    const versions = new Map(rows.map((row) => [row.component, Number(row.version)]));
    for (const [component, version] of Object.entries(SUPPORTED_SCHEMA_VERSIONS)) {
      if (versions.get(component) !== version) {
        throw new Error(
          `Target schema ${component} is version ${versions.get(component) ?? "missing"}; this tool writes version ${version}`,
        );
      }
    }
  }
}

function context(request: object): DatabaseContext {
  return { userID: MIGRATION_USER_ID, customData: Object.create(null) as Record<string, unknown>, request };
}

function fileContext(request: { readonly fileID: string }): FileContext {
  return { userID: MIGRATION_USER_ID, customData: Object.create(null) as Record<string, unknown>, request };
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  pdf: "application/pdf",
  json: "application/json",
};

// Universer keeps no content type; it is derived from the file name.
function contentTypeOf(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}
