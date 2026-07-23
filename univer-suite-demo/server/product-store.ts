import { DatabaseSync } from "node:sqlite";
import type { UniverType } from "@univerjs/protocol";

export type ResourceStatus = "creating" | "active" | "failed" | "deleted";
export type ResourceMemberRole = "editor" | "viewer";
export type ResourceAccessRole = "owner" | ResourceMemberRole;

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

interface ResourceMemberRow {
  readonly resource_id: string;
  readonly user_id: string;
  readonly role: ResourceMemberRole;
  readonly created_by: string;
  readonly created_at: number;
}

export interface ResourceMember {
  readonly resourceID: string;
  readonly userId: string;
  readonly role: ResourceMemberRole;
  readonly createdBy: string;
  readonly createdAt: number;
}

export interface SharedResource {
  readonly resource: SuiteResource;
  readonly role: ResourceMemberRole;
}

export interface RecentResource {
  readonly resource: SuiteResource;
  readonly role: ResourceAccessRole;
  readonly lastOpenedAt: number;
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
      CREATE TABLE IF NOT EXISTS suite_resource_members (
        resource_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (resource_id, user_id),
        FOREIGN KEY (resource_id) REFERENCES suite_resources(id)
          ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS suite_resource_members_user
        ON suite_resource_members(user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS suite_resource_recents (
        resource_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_opened_at INTEGER NOT NULL,
        PRIMARY KEY (resource_id, user_id),
        FOREIGN KEY (resource_id) REFERENCES suite_resources(id)
          ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS suite_resource_recents_user_opened
        ON suite_resource_recents(user_id, last_opened_at DESC);
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
    const deleted = this._setStatus(id, "deleted");
    this._database
      .prepare("DELETE FROM suite_resource_recents WHERE resource_id = ?")
      .run(id);
    return deleted;
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

  renameByUnitID(unitID: string, name: string): SuiteResource | null {
    this._assertOpen();
    const result = this._database
      .prepare(
        `UPDATE suite_resources
         SET name = ?, updated_at = ?
         WHERE unit_id = ? AND status = 'active'`
      )
      .run(name, Date.now(), unitID);
    return result.changes === 1 ? this.getByUnitID(unitID) : null;
  }

  getAccessRoleByID(
    resourceID: string,
    userId: string
  ): ResourceAccessRole | null {
    const resource = this.getByID(resourceID);
    return resource ? this._getAccessRole(resource, userId) : null;
  }

  getAccessRoleByUnitID(
    unitID: string,
    userId: string
  ): ResourceAccessRole | null {
    const resource = this.getByUnitID(unitID);
    return resource ? this._getAccessRole(resource, userId) : null;
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

  listShared(userId: string): SharedResource[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT
           r.id, r.unit_id, r.type, r.name, r.owner_user_id, r.status,
           r.created_at, r.updated_at, m.role
         FROM suite_resource_members AS m
         JOIN suite_resources AS r ON r.id = m.resource_id
         WHERE m.user_id = ? AND r.status = 'active'
         ORDER BY r.updated_at DESC, r.id ASC`
      )
      .all(userId) as unknown as Array<ResourceRow & {
        readonly role: ResourceMemberRole;
      }>;
    return rows.map((row) => ({
      resource: toResource(row),
      role: row.role,
    }));
  }

  markOpened(resourceID: string, userId: string): number {
    this._assertOpen();
    const latest = this._database
      .prepare(
        `SELECT MAX(last_opened_at) AS last_opened_at
         FROM suite_resource_recents
         WHERE user_id = ?`
      )
      .get(userId) as { readonly last_opened_at: number | null };
    const lastOpenedAt = Math.max(
      Date.now(),
      (latest.last_opened_at ?? 0) + 1
    );
    this._database
      .prepare(
        `INSERT INTO suite_resource_recents
          (resource_id, user_id, last_opened_at)
         VALUES (?, ?, ?)
         ON CONFLICT(resource_id, user_id)
         DO UPDATE SET last_opened_at = excluded.last_opened_at`
      )
      .run(resourceID, userId, lastOpenedAt);
    return lastOpenedAt;
  }

  listRecent(userId: string): RecentResource[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT
           r.id, r.unit_id, r.type, r.name, r.owner_user_id, r.status,
           r.created_at, r.updated_at, recent.last_opened_at,
           CASE
             WHEN r.owner_user_id = ? THEN 'owner'
             ELSE member.role
           END AS access_role
         FROM suite_resource_recents AS recent
         JOIN suite_resources AS r ON r.id = recent.resource_id
         LEFT JOIN suite_resource_members AS member
           ON member.resource_id = r.id AND member.user_id = recent.user_id
         WHERE recent.user_id = ?
           AND r.status = 'active'
           AND (r.owner_user_id = ? OR member.user_id IS NOT NULL)
         ORDER BY recent.last_opened_at DESC, r.id ASC`
      )
      .all(userId, userId, userId) as unknown as Array<
      ResourceRow & {
        readonly access_role: ResourceAccessRole;
        readonly last_opened_at: number;
      }
    >;
    return rows.map((row) => ({
      resource: toResource(row),
      role: row.access_role,
      lastOpenedAt: row.last_opened_at,
    }));
  }

  listMembers(resourceID: string): ResourceMember[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT resource_id, user_id, role, created_by, created_at
         FROM suite_resource_members
         WHERE resource_id = ?
         ORDER BY created_at ASC, user_id ASC`
      )
      .all(resourceID) as unknown as ResourceMemberRow[];
    return rows.map(toResourceMember);
  }

  setMember(input: {
    readonly resourceID: string;
    readonly userId: string;
    readonly role: ResourceMemberRole;
    readonly createdBy: string;
  }): ResourceMember {
    this._assertOpen();
    const resource = this.getByID(input.resourceID);
    if (!resource) {
      throw new Error(`Resource does not exist: ${input.resourceID}`);
    }
    if (resource.ownerUserId === input.userId) {
      throw new Error("Resource owner cannot be added as a member");
    }
    const createdAt = Date.now();
    this._database
      .prepare(
        `INSERT INTO suite_resource_members
          (resource_id, user_id, role, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(resource_id, user_id) DO UPDATE SET role = excluded.role`
      )
      .run(
        input.resourceID,
        input.userId,
        input.role,
        input.createdBy,
        createdAt
      );
    return this.getMember(input.resourceID, input.userId)!;
  }

  getMember(resourceID: string, userId: string): ResourceMember | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT resource_id, user_id, role, created_by, created_at
         FROM suite_resource_members
         WHERE resource_id = ? AND user_id = ?`
      )
      .get(resourceID, userId) as ResourceMemberRow | undefined;
    return row ? toResourceMember(row) : null;
  }

  removeMember(resourceID: string, userId: string): boolean {
    this._assertOpen();
    const removed =
      this._database
        .prepare(
          `DELETE FROM suite_resource_members
           WHERE resource_id = ? AND user_id = ?`
        )
        .run(resourceID, userId).changes === 1;
    if (removed) {
      this._database
        .prepare(
          `DELETE FROM suite_resource_recents
           WHERE resource_id = ? AND user_id = ?`
        )
        .run(resourceID, userId);
    }
    return removed;
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

  private _getAccessRole(
    resource: SuiteResource,
    userId: string
  ): ResourceAccessRole | null {
    if (resource.ownerUserId === userId) return "owner";
    return this.getMember(resource.id, userId)?.role ?? null;
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

function toResourceMember(row: ResourceMemberRow): ResourceMember {
  return {
    resourceID: row.resource_id,
    userId: row.user_id,
    role: row.role,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
