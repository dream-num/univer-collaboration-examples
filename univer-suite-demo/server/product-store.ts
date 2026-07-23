import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { UniverType } from "@univerjs/protocol";

export type SpaceType = "personal" | "team";
export type SpaceMemberRole = "admin" | "editor" | "viewer";
export type SpaceAccessRole = "owner" | SpaceMemberRole;
export type ResourceMemberRole = "editor" | "viewer";
export type ResourceAccessRole = SpaceAccessRole | ResourceMemberRole;
export type NodeStatus = "creating" | "active" | "failed" | "deleted";

export interface SuiteSpace {
  readonly id: string;
  readonly type: SpaceType;
  readonly name: string;
  readonly ownerUserId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SuiteFolder {
  readonly kind: "folder";
  readonly id: string;
  readonly spaceID: string;
  readonly parentID: string | null;
  readonly name: string;
  readonly status: NodeStatus;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface SuiteResource {
  readonly kind: "unit";
  readonly id: string;
  readonly spaceID: string;
  readonly parentID: string | null;
  readonly unitID: string;
  readonly type: UniverType;
  readonly name: string;
  readonly ownerUserId: string;
  readonly spaceType: SpaceType;
  readonly spaceName: string;
  readonly status: NodeStatus;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type SuiteNode = SuiteFolder | SuiteResource;

export interface SpaceMember {
  readonly spaceID: string;
  readonly userId: string;
  readonly role: SpaceMemberRole;
  readonly invitedBy: string;
  readonly createdAt: number;
}

export interface ResourceMember {
  readonly resourceID: string;
  readonly userId: string;
  readonly role: ResourceMemberRole;
  readonly invitedBy: string;
  readonly createdAt: number;
}

export interface AccessibleSpace {
  readonly space: SuiteSpace;
  readonly role: SpaceAccessRole;
}

export interface AccessibleResource {
  readonly resource: SuiteResource;
  readonly role: ResourceAccessRole;
}

export interface RecentResource extends AccessibleResource {
  readonly lastOpenedAt: number;
}

interface SpaceRow {
  readonly id: string;
  readonly type: SpaceType;
  readonly name: string;
  readonly owner_user_id: string;
  readonly created_at: number;
  readonly updated_at: number;
}

interface NodeRow {
  readonly id: string;
  readonly space_id: string;
  readonly parent_id: string | null;
  readonly kind: "folder" | "unit";
  readonly name: string;
  readonly status: NodeStatus;
  readonly created_by: string;
  readonly created_at: number;
  readonly updated_at: number;
}

interface ResourceRow extends NodeRow {
  readonly unit_id: string;
  readonly unit_type: number;
  readonly owner_user_id: string;
  readonly space_type: SpaceType;
  readonly space_name: string;
}

interface SpaceMemberRow {
  readonly space_id: string;
  readonly user_id: string;
  readonly role: SpaceMemberRole;
  readonly invited_by: string;
  readonly created_at: number;
}

interface ResourceMemberRow {
  readonly node_id: string;
  readonly user_id: string;
  readonly role: ResourceMemberRole;
  readonly invited_by: string;
  readonly created_at: number;
}

const RESOURCE_SELECT = `
  SELECT
    node.id, node.space_id, node.parent_id, node.kind, node.name, node.status,
    node.created_by, node.created_at, node.updated_at,
    unit.unit_id, unit.unit_type,
    space.owner_user_id, space.type AS space_type, space.name AS space_name
  FROM suite_nodes AS node
  JOIN suite_units AS unit ON unit.node_id = node.id
  JOIN suite_spaces AS space ON space.id = node.space_id
`;

/**
 * 空间、目录和协同 Unit 是产品层数据。协同数据库只保存 Unit snapshot 与 changeset，
 * 不参与目录或 RBAC 计算。
 */
export class ProductStore {
  private readonly _database: DatabaseSync;
  private _disposed = false;

  constructor(filename: string) {
    this._database = new DatabaseSync(filename);
    this._database.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS suite_spaces (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('personal', 'team')),
        name TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS suite_spaces_personal_owner
        ON suite_spaces(owner_user_id)
        WHERE type = 'personal';

      CREATE TABLE IF NOT EXISTS suite_space_members (
        space_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
        invited_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (space_id, user_id),
        FOREIGN KEY (space_id) REFERENCES suite_spaces(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS suite_space_members_user
        ON suite_space_members(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS suite_nodes (
        id TEXT PRIMARY KEY,
        space_id TEXT NOT NULL,
        parent_id TEXT,
        kind TEXT NOT NULL CHECK (kind IN ('folder', 'unit')),
        name TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK (status IN ('creating', 'active', 'failed', 'deleted')),
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (space_id) REFERENCES suite_spaces(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES suite_nodes(id) ON DELETE RESTRICT
      );
      CREATE INDEX IF NOT EXISTS suite_nodes_space_parent_status
        ON suite_nodes(space_id, parent_id, status, kind, name);

      CREATE TABLE IF NOT EXISTS suite_units (
        node_id TEXT PRIMARY KEY,
        unit_id TEXT NOT NULL UNIQUE,
        unit_type INTEGER NOT NULL,
        FOREIGN KEY (node_id) REFERENCES suite_nodes(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS suite_node_members (
        node_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
        invited_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (node_id, user_id),
        FOREIGN KEY (node_id) REFERENCES suite_nodes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS suite_node_members_user
        ON suite_node_members(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS suite_node_recents (
        node_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        last_opened_at INTEGER NOT NULL,
        PRIMARY KEY (node_id, user_id),
        FOREIGN KEY (node_id) REFERENCES suite_nodes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS suite_node_recents_user_opened
        ON suite_node_recents(user_id, last_opened_at DESC);
    `);
  }

  ensurePersonalSpace(userId: string, userName: string): SuiteSpace {
    this._assertOpen();
    const existing = this._database
      .prepare(
        `SELECT id, type, name, owner_user_id, created_at, updated_at
         FROM suite_spaces
         WHERE type = 'personal' AND owner_user_id = ?`
      )
      .get(userId) as SpaceRow | undefined;
    if (existing) return toSpace(existing);

    const now = Date.now();
    const id = randomUUID();
    this._database
      .prepare(
        `INSERT INTO suite_spaces
          (id, type, name, owner_user_id, created_at, updated_at)
         VALUES (?, 'personal', ?, ?, ?, ?)`
      )
      .run(id, `${userName}的个人空间`, userId, now, now);
    return this.getSpace(id)!;
  }

  createTeam(input: {
    readonly id: string;
    readonly name: string;
    readonly ownerUserId: string;
  }): SuiteSpace {
    this._assertOpen();
    const now = Date.now();
    this._database
      .prepare(
        `INSERT INTO suite_spaces
          (id, type, name, owner_user_id, created_at, updated_at)
         VALUES (?, 'team', ?, ?, ?, ?)`
      )
      .run(input.id, input.name, input.ownerUserId, now, now);
    return this.getSpace(input.id)!;
  }

  getSpace(spaceID: string): SuiteSpace | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT id, type, name, owner_user_id, created_at, updated_at
         FROM suite_spaces WHERE id = ?`
      )
      .get(spaceID) as SpaceRow | undefined;
    return row ? toSpace(row) : null;
  }

  listSpaces(userId: string): AccessibleSpace[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT
           space.id, space.type, space.name, space.owner_user_id,
           space.created_at, space.updated_at,
           CASE
             WHEN space.owner_user_id = ? THEN 'owner'
             ELSE member.role
           END AS access_role
         FROM suite_spaces AS space
         LEFT JOIN suite_space_members AS member
           ON member.space_id = space.id AND member.user_id = ?
         WHERE space.owner_user_id = ? OR member.user_id IS NOT NULL
         ORDER BY
           CASE WHEN space.type = 'personal' THEN 0 ELSE 1 END,
           space.name COLLATE NOCASE ASC`
      )
      .all(userId, userId, userId) as unknown as Array<
      SpaceRow & { readonly access_role: SpaceAccessRole }
    >;
    return rows.map((row) => ({
      space: toSpace(row),
      role: row.access_role,
    }));
  }

  getSpaceRole(spaceID: string, userId: string): SpaceAccessRole | null {
    const space = this.getSpace(spaceID);
    if (!space) return null;
    if (space.ownerUserId === userId) return "owner";
    const row = this._database
      .prepare(
        `SELECT role FROM suite_space_members
         WHERE space_id = ? AND user_id = ?`
      )
      .get(spaceID, userId) as { readonly role: SpaceMemberRole } | undefined;
    return row?.role ?? null;
  }

  listSpaceMembers(spaceID: string): SpaceMember[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT space_id, user_id, role, invited_by, created_at
         FROM suite_space_members
         WHERE space_id = ?
         ORDER BY
           CASE role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
           created_at ASC, user_id ASC`
      )
      .all(spaceID) as unknown as SpaceMemberRow[];
    return rows.map(toSpaceMember);
  }

  getSpaceMember(spaceID: string, userId: string): SpaceMember | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT space_id, user_id, role, invited_by, created_at
         FROM suite_space_members
         WHERE space_id = ? AND user_id = ?`
      )
      .get(spaceID, userId) as SpaceMemberRow | undefined;
    return row ? toSpaceMember(row) : null;
  }

  setSpaceMember(input: {
    readonly spaceID: string;
    readonly userId: string;
    readonly role: SpaceMemberRole;
    readonly invitedBy: string;
  }): SpaceMember {
    this._assertOpen();
    const space = this.getSpace(input.spaceID);
    if (!space || space.type !== "team") {
      throw new Error(`Team space does not exist: ${input.spaceID}`);
    }
    if (space.ownerUserId === input.userId) {
      throw new Error("Space owner cannot be added as a member");
    }
    this._database
      .prepare(
        `INSERT INTO suite_space_members
          (space_id, user_id, role, invited_by, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(space_id, user_id)
         DO UPDATE SET role = excluded.role`
      )
      .run(
        input.spaceID,
        input.userId,
        input.role,
        input.invitedBy,
        Date.now()
      );
    return this.getSpaceMember(input.spaceID, input.userId)!;
  }

  removeSpaceMember(spaceID: string, userId: string): boolean {
    this._assertOpen();
    const removed =
      this._database
        .prepare(
          `DELETE FROM suite_space_members
           WHERE space_id = ? AND user_id = ?`
        )
        .run(spaceID, userId).changes === 1;
    if (removed) {
      this._database
        .prepare(
          `DELETE FROM suite_node_recents
           WHERE user_id = ? AND node_id IN (
             SELECT id FROM suite_nodes WHERE space_id = ?
           )`
        )
        .run(userId, spaceID);
    }
    return removed;
  }

  createFolder(input: {
    readonly id: string;
    readonly spaceID: string;
    readonly parentID: string | null;
    readonly name: string;
    readonly createdBy: string;
  }): SuiteFolder {
    this._assertValidParent(input.spaceID, input.parentID);
    const now = Date.now();
    this._database
      .prepare(
        `INSERT INTO suite_nodes
          (id, space_id, parent_id, kind, name, status, created_by,
           created_at, updated_at)
         VALUES (?, ?, ?, 'folder', ?, 'active', ?, ?, ?)`
      )
      .run(
        input.id,
        input.spaceID,
        input.parentID,
        input.name,
        input.createdBy,
        now,
        now
      );
    return this.getFolder(input.id)!;
  }

  getFolder(folderID: string): SuiteFolder | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT id, space_id, parent_id, kind, name, status, created_by,
                created_at, updated_at
         FROM suite_nodes
         WHERE id = ? AND kind = 'folder'`
      )
      .get(folderID) as NodeRow | undefined;
    return row ? toFolder(row) : null;
  }

  listChildren(
    spaceID: string,
    parentID: string | null
  ): SuiteNode[] {
    this._assertOpen();
    const folderRows = this._database
      .prepare(
        `SELECT id, space_id, parent_id, kind, name, status, created_by,
                created_at, updated_at
         FROM suite_nodes
         WHERE space_id = ?
           AND parent_id IS ?
           AND kind = 'folder'
           AND status = 'active'
         ORDER BY name COLLATE NOCASE ASC, id ASC`
      )
      .all(spaceID, parentID) as unknown as NodeRow[];
    const resourceRows = this._database
      .prepare(
        `${RESOURCE_SELECT}
         WHERE node.space_id = ?
           AND node.parent_id IS ?
           AND node.status = 'active'
         ORDER BY node.name COLLATE NOCASE ASC, node.id ASC`
      )
      .all(spaceID, parentID) as unknown as ResourceRow[];
    return [...folderRows.map(toFolder), ...resourceRows.map(toResource)];
  }

  getBreadcrumbs(spaceID: string, folderID: string | null): SuiteFolder[] {
    const breadcrumbs: SuiteFolder[] = [];
    let currentID = folderID;
    const visited = new Set<string>();
    while (currentID) {
      if (visited.has(currentID)) throw new Error("Folder cycle detected");
      visited.add(currentID);
      const folder = this.getFolder(currentID);
      if (
        !folder ||
        folder.spaceID !== spaceID ||
        folder.status !== "active"
      ) {
        throw new Error("Folder does not exist");
      }
      breadcrumbs.unshift(folder);
      currentID = folder.parentID;
    }
    return breadcrumbs;
  }

  createPending(input: {
    readonly id: string;
    readonly unitID: string;
    readonly type: UniverType;
    readonly name: string;
    readonly spaceID: string;
    readonly parentID: string | null;
    readonly createdBy: string;
  }): SuiteResource {
    this._assertValidParent(input.spaceID, input.parentID);
    const now = Date.now();
    this._database.exec("BEGIN IMMEDIATE");
    try {
      this._database
        .prepare(
          `INSERT INTO suite_nodes
            (id, space_id, parent_id, kind, name, status, created_by,
             created_at, updated_at)
           VALUES (?, ?, ?, 'unit', ?, 'creating', ?, ?, ?)`
        )
        .run(
          input.id,
          input.spaceID,
          input.parentID,
          input.name,
          input.createdBy,
          now,
          now
        );
      this._database
        .prepare(
          `INSERT INTO suite_units (node_id, unit_id, unit_type)
           VALUES (?, ?, ?)`
        )
        .run(input.id, input.unitID, input.type);
      this._database.exec("COMMIT");
    } catch (error) {
      this._database.exec("ROLLBACK");
      throw error;
    }
    return this.getByID(input.id)!;
  }

  markActive(id: string): SuiteResource {
    this._setNodeStatus(id, "active");
    return this.getByID(id)!;
  }

  markFailed(id: string): SuiteResource {
    this._setNodeStatus(id, "failed");
    return this.getByID(id)!;
  }

  getByID(id: string): SuiteResource | null {
    this._assertOpen();
    const row = this._database
      .prepare(`${RESOURCE_SELECT} WHERE node.id = ?`)
      .get(id) as ResourceRow | undefined;
    return row ? toResource(row) : null;
  }

  getByUnitID(unitID: string): SuiteResource | null {
    this._assertOpen();
    const row = this._database
      .prepare(`${RESOURCE_SELECT} WHERE unit.unit_id = ?`)
      .get(unitID) as ResourceRow | undefined;
    return row ? toResource(row) : null;
  }

  renameByUnitID(unitID: string, name: string): SuiteResource | null {
    this._assertOpen();
    const result = this._database
      .prepare(
        `UPDATE suite_nodes
         SET name = ?, updated_at = ?
         WHERE id = (SELECT node_id FROM suite_units WHERE unit_id = ?)
           AND status = 'active'`
      )
      .run(name, Date.now(), unitID);
    return result.changes === 1 ? this.getByUnitID(unitID) : null;
  }

  renameFolder(folderID: string, name: string): SuiteFolder | null {
    this._assertOpen();
    const result = this._database
      .prepare(
        `UPDATE suite_nodes
         SET name = ?, updated_at = ?
         WHERE id = ? AND kind = 'folder' AND status = 'active'`
      )
      .run(name, Date.now(), folderID);
    return result.changes === 1 ? this.getFolder(folderID) : null;
  }

  softDeleteNode(nodeID: string): boolean {
    this._assertOpen();
    const now = Date.now();
    this._database.exec("BEGIN IMMEDIATE");
    try {
      const result = this._database
        .prepare(
          `WITH RECURSIVE descendants(id) AS (
             SELECT id FROM suite_nodes WHERE id = ? AND status = 'active'
             UNION ALL
             SELECT node.id
             FROM suite_nodes AS node
             JOIN descendants ON node.parent_id = descendants.id
             WHERE node.status = 'active'
           )
           UPDATE suite_nodes
           SET status = 'deleted', updated_at = ?
           WHERE id IN (SELECT id FROM descendants)`
        )
        .run(nodeID, now);
      if (result.changes > 0) {
        this._database
          .prepare(
            `DELETE FROM suite_node_recents
             WHERE node_id IN (
               WITH RECURSIVE descendants(id) AS (
                 SELECT id FROM suite_nodes WHERE id = ?
                 UNION ALL
                 SELECT node.id
                 FROM suite_nodes AS node
                 JOIN descendants ON node.parent_id = descendants.id
               )
               SELECT id FROM descendants
             )`
          )
          .run(nodeID);
      }
      this._database.exec("COMMIT");
      return result.changes > 0;
    } catch (error) {
      this._database.exec("ROLLBACK");
      throw error;
    }
  }

  restoreNode(nodeID: string): boolean {
    this._assertOpen();
    const parent = this._database
      .prepare(
        `SELECT parent_id FROM suite_nodes
         WHERE id = ? AND status = 'deleted'`
      )
      .get(nodeID) as { readonly parent_id: string | null } | undefined;
    if (!parent) return false;
    if (parent.parent_id) {
      const parentStatus = this._database
        .prepare("SELECT status FROM suite_nodes WHERE id = ?")
        .get(parent.parent_id) as { readonly status: NodeStatus } | undefined;
      if (parentStatus?.status === "deleted") return false;
    }
    const result = this._database
      .prepare(
        `WITH RECURSIVE descendants(id) AS (
           SELECT id FROM suite_nodes WHERE id = ? AND status = 'deleted'
           UNION ALL
           SELECT node.id
           FROM suite_nodes AS node
           JOIN descendants ON node.parent_id = descendants.id
           WHERE node.status = 'deleted'
         )
         UPDATE suite_nodes
         SET status = 'active', updated_at = ?
         WHERE id IN (SELECT id FROM descendants)`
      )
      .run(nodeID, Date.now());
    return result.changes > 0;
  }

  listTrash(spaceID: string): SuiteNode[] {
    this._assertOpen();
    const folderRows = this._database
      .prepare(
        `SELECT node.id, node.space_id, node.parent_id, node.kind, node.name,
                node.status, node.created_by, node.created_at, node.updated_at
         FROM suite_nodes AS node
         LEFT JOIN suite_nodes AS parent ON parent.id = node.parent_id
         WHERE node.space_id = ?
           AND node.kind = 'folder'
           AND node.status = 'deleted'
           AND (parent.id IS NULL OR parent.status != 'deleted')
         ORDER BY node.updated_at DESC, node.id ASC`
      )
      .all(spaceID) as unknown as NodeRow[];
    const resourceRows = this._database
      .prepare(
        `${RESOURCE_SELECT}
         LEFT JOIN suite_nodes AS parent ON parent.id = node.parent_id
         WHERE node.space_id = ?
           AND node.status = 'deleted'
           AND (parent.id IS NULL OR parent.status != 'deleted')
         ORDER BY node.updated_at DESC, node.id ASC`
      )
      .all(spaceID) as unknown as ResourceRow[];
    return [...folderRows.map(toFolder), ...resourceRows.map(toResource)].sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
  }

  getAccessRoleByID(
    resourceID: string,
    userId: string
  ): ResourceAccessRole | null {
    const resource = this.getByID(resourceID);
    return resource ? this._getResourceRole(resource, userId) : null;
  }

  getAccessRoleByUnitID(
    unitID: string,
    userId: string
  ): ResourceAccessRole | null {
    const resource = this.getByUnitID(unitID);
    return resource ? this._getResourceRole(resource, userId) : null;
  }

  listShared(userId: string): AccessibleResource[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `${RESOURCE_SELECT}
         JOIN suite_node_members AS member ON member.node_id = node.id
         WHERE member.user_id = ?
           AND space.type = 'personal'
           AND node.status = 'active'
         ORDER BY node.updated_at DESC, node.id ASC`
      )
      .all(userId) as unknown as Array<
      ResourceRow & { readonly role: ResourceMemberRole }
    >;
    return rows.map((row) => ({
      resource: toResource(row),
      role: this.getResourceMember(row.id, userId)!.role,
    }));
  }

  markOpened(resourceID: string, userId: string): number {
    this._assertOpen();
    const latest = this._database
      .prepare(
        `SELECT MAX(last_opened_at) AS last_opened_at
         FROM suite_node_recents WHERE user_id = ?`
      )
      .get(userId) as { readonly last_opened_at: number | null };
    const lastOpenedAt = Math.max(
      Date.now(),
      (latest.last_opened_at ?? 0) + 1
    );
    this._database
      .prepare(
        `INSERT INTO suite_node_recents (node_id, user_id, last_opened_at)
         VALUES (?, ?, ?)
         ON CONFLICT(node_id, user_id)
         DO UPDATE SET last_opened_at = excluded.last_opened_at`
      )
      .run(resourceID, userId, lastOpenedAt);
    return lastOpenedAt;
  }

  listRecent(userId: string): RecentResource[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `${RESOURCE_SELECT}
         JOIN suite_node_recents AS recent ON recent.node_id = node.id
         WHERE recent.user_id = ? AND node.status = 'active'
         ORDER BY recent.last_opened_at DESC, node.id ASC`
      )
      .all(userId) as unknown as ResourceRow[];
    const openedAt = this._database.prepare(
      `SELECT last_opened_at FROM suite_node_recents
       WHERE node_id = ? AND user_id = ?`
    );
    return rows.flatMap((row) => {
      const resource = toResource(row);
      const role = this._getResourceRole(resource, userId);
      if (!role) return [];
      const recent = openedAt.get(resource.id, userId) as {
        readonly last_opened_at: number;
      };
      return [{ resource, role, lastOpenedAt: recent.last_opened_at }];
    });
  }

  listResourceMembers(resourceID: string): ResourceMember[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT node_id, user_id, role, invited_by, created_at
         FROM suite_node_members
         WHERE node_id = ?
         ORDER BY created_at ASC, user_id ASC`
      )
      .all(resourceID) as unknown as ResourceMemberRow[];
    return rows.map(toResourceMember);
  }

  getResourceMember(
    resourceID: string,
    userId: string
  ): ResourceMember | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT node_id, user_id, role, invited_by, created_at
         FROM suite_node_members
         WHERE node_id = ? AND user_id = ?`
      )
      .get(resourceID, userId) as ResourceMemberRow | undefined;
    return row ? toResourceMember(row) : null;
  }

  setResourceMember(input: {
    readonly resourceID: string;
    readonly userId: string;
    readonly role: ResourceMemberRole;
    readonly invitedBy: string;
  }): ResourceMember {
    this._assertOpen();
    const resource = this.getByID(input.resourceID);
    if (!resource || resource.spaceType !== "personal") {
      throw new Error("Only personal resources can be shared directly");
    }
    if (resource.ownerUserId === input.userId) {
      throw new Error("Resource owner cannot be added as a member");
    }
    this._database
      .prepare(
        `INSERT INTO suite_node_members
          (node_id, user_id, role, invited_by, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(node_id, user_id)
         DO UPDATE SET role = excluded.role`
      )
      .run(
        input.resourceID,
        input.userId,
        input.role,
        input.invitedBy,
        Date.now()
      );
    return this.getResourceMember(input.resourceID, input.userId)!;
  }

  removeResourceMember(resourceID: string, userId: string): boolean {
    this._assertOpen();
    const removed =
      this._database
        .prepare(
          `DELETE FROM suite_node_members
           WHERE node_id = ? AND user_id = ?`
        )
        .run(resourceID, userId).changes === 1;
    if (removed) {
      this._database
        .prepare(
          `DELETE FROM suite_node_recents
           WHERE node_id = ? AND user_id = ?`
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

  private _getResourceRole(
    resource: SuiteResource,
    userId: string
  ): ResourceAccessRole | null {
    if (resource.ownerUserId === userId) return "owner";
    if (resource.spaceType === "team") {
      return this.getSpaceMember(resource.spaceID, userId)?.role ?? null;
    }
    return this.getResourceMember(resource.id, userId)?.role ?? null;
  }

  private _assertValidParent(
    spaceID: string,
    parentID: string | null
  ): void {
    this._assertOpen();
    if (!this.getSpace(spaceID)) {
      throw new Error(`Space does not exist: ${spaceID}`);
    }
    if (!parentID) return;
    const parent = this.getFolder(parentID);
    if (
      !parent ||
      parent.spaceID !== spaceID ||
      parent.status !== "active"
    ) {
      throw new Error("Parent folder does not exist");
    }
  }

  private _setNodeStatus(id: string, status: NodeStatus): void {
    this._assertOpen();
    const result = this._database
      .prepare(
        "UPDATE suite_nodes SET status = ?, updated_at = ? WHERE id = ?"
      )
      .run(status, Date.now(), id);
    if (result.changes !== 1) {
      throw new Error(`Node does not exist: ${id}`);
    }
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error("ProductStore is disposed");
  }
}

function toSpace(row: SpaceRow): SuiteSpace {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFolder(row: NodeRow): SuiteFolder {
  return {
    kind: "folder",
    id: row.id,
    spaceID: row.space_id,
    parentID: row.parent_id,
    name: row.name,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toResource(row: ResourceRow): SuiteResource {
  return {
    kind: "unit",
    id: row.id,
    spaceID: row.space_id,
    parentID: row.parent_id,
    unitID: row.unit_id,
    type: row.unit_type as UniverType,
    name: row.name,
    ownerUserId: row.owner_user_id,
    spaceType: row.space_type,
    spaceName: row.space_name,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSpaceMember(row: SpaceMemberRow): SpaceMember {
  return {
    spaceID: row.space_id,
    userId: row.user_id,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  };
}

function toResourceMember(row: ResourceMemberRow): ResourceMember {
  return {
    resourceID: row.node_id,
    userId: row.user_id,
    role: row.role,
    invitedBy: row.invited_by,
    createdAt: row.created_at,
  };
}
