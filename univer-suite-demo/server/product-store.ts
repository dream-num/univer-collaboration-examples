import { DatabaseSync } from "node:sqlite";
import type { UniverType } from "@univerjs/protocol";

export type ResourceStatus = "creating" | "active" | "failed" | "deleted";

export interface SuiteResource {
  readonly id: string;
  readonly unitID: string;
  readonly type: UniverType;
  readonly name: string;
  readonly ownerUserId: string;
  readonly status: ResourceStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

interface ResourceRow {
  readonly id: string;
  readonly unit_id: string;
  readonly type: number;
  readonly name: string;
  readonly owner_user_id: string;
  readonly status: ResourceStatus;
  readonly created_at: number;
  readonly updated_at: number;
}

/**
 * 产品资源与协同数据使用不同的表。这里保持独立连接，避免应用依赖
 * SQLiteDatabaseAdapter 的内部 schema 或事务实现。
 */
export class ProductStore {
  private readonly _database: DatabaseSync;
  private _disposed = false;

  constructor(filename: string) {
    this._database = new DatabaseSync(filename);
    this._database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS suite_resources (
        id TEXT PRIMARY KEY,
        unit_id TEXT NOT NULL UNIQUE,
        type INTEGER NOT NULL,
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN ('creating', 'active', 'failed', 'deleted')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    const columns = this._database
      .prepare("PRAGMA table_info(suite_resources)")
      .all() as Array<{ readonly name: string }>;
    if (!columns.some(({ name }) => name === "owner_user_id")) {
      this._database.exec(
        "ALTER TABLE suite_resources ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT 'legacy-demo-user'"
      );
    }
    this._database.exec(`
      CREATE INDEX IF NOT EXISTS suite_resources_owner_status_updated
        ON suite_resources(owner_user_id, status, updated_at DESC);
    `);
  }

  createPending(input: {
    readonly id: string;
    readonly unitID: string;
    readonly type: UniverType;
    readonly name: string;
    readonly ownerUserId: string;
  }): SuiteResource {
    this._assertOpen();
    const now = Date.now();
    this._database
      .prepare(
        `INSERT INTO suite_resources
          (id, unit_id, type, name, owner_user_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'creating', ?, ?)`
      )
      .run(
        input.id,
        input.unitID,
        input.type,
        input.name,
        input.ownerUserId,
        now,
        now
      );
    return this.getByID(input.id)!;
  }

  markActive(id: string): SuiteResource {
    return this._setStatus(id, "active");
  }

  markFailed(id: string): SuiteResource {
    return this._setStatus(id, "failed");
  }

  softDelete(id: string): SuiteResource | null {
    const resource = this.getByID(id);
    if (!resource || resource.status !== "active") return null;
    return this._setStatus(id, "deleted");
  }

  restore(id: string): SuiteResource | null {
    const resource = this.getByID(id);
    if (!resource || resource.status !== "deleted") return null;
    return this._setStatus(id, "active");
  }

  getByID(id: string): SuiteResource | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT id, unit_id, type, name, owner_user_id, status, created_at, updated_at
         FROM suite_resources
         WHERE id = ?`
      )
      .get(id) as ResourceRow | undefined;
    return row ? toResource(row) : null;
  }

  getByUnitID(unitID: string): SuiteResource | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT id, unit_id, type, name, owner_user_id, status, created_at, updated_at
         FROM suite_resources
         WHERE unit_id = ?`
      )
      .get(unitID) as ResourceRow | undefined;
    return row ? toResource(row) : null;
  }

  list(
    status: "active" | "deleted" = "active",
    ownerUserId?: string
  ): SuiteResource[] {
    this._assertOpen();
    const statement = ownerUserId
      ? this._database.prepare(
          `SELECT id, unit_id, type, name, owner_user_id, status, created_at, updated_at
           FROM suite_resources
           WHERE status = ? AND owner_user_id = ?
           ORDER BY updated_at DESC, id ASC`
        )
      : this._database.prepare(
          `SELECT id, unit_id, type, name, owner_user_id, status, created_at, updated_at
           FROM suite_resources
           WHERE status = ?
           ORDER BY updated_at DESC, id ASC`
        );
    const rows = (
      ownerUserId
        ? statement.all(status, ownerUserId)
        : statement.all(status)
    ) as unknown as ResourceRow[];
    return rows.map(toResource);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._database.close();
  }

  private _setStatus(id: string, status: ResourceStatus): SuiteResource {
    this._assertOpen();
    const result = this._database
      .prepare(
        "UPDATE suite_resources SET status = ?, updated_at = ? WHERE id = ?"
      )
      .run(status, Date.now(), id);
    if (result.changes !== 1) {
      throw new Error(`Resource does not exist: ${id}`);
    }
    return this.getByID(id)!;
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error("ProductStore is disposed");
  }
}

function toResource(row: ResourceRow): SuiteResource {
  return {
    id: row.id,
    unitID: row.unit_id,
    type: row.type as UniverType,
    name: row.name,
    ownerUserId: row.owner_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
