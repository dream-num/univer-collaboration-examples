import type Database from "libsql";
import type { UnitObject, UnitRole } from "@univerjs/protocol";

import type { ObjectCollaborator, PermissionObject, PermissionObjectScope, PermissionStrategy } from "./acl-types";

interface ObjectRow {
  object_id: string;
  unit_id: string;
  object_type: UnitObject;
  creator_user_id: string;
  name: string;
  strategies_json: string;
  scope_json: string | null;
}

function toObject(row: ObjectRow): PermissionObject {
  return {
    objectId: row.object_id,
    unitId: row.unit_id,
    objectType: row.object_type,
    creatorUserId: row.creator_user_id,
    name: row.name,
    strategies: JSON.parse(row.strategies_json) as PermissionStrategy[],
    scope: row.scope_json ? (JSON.parse(row.scope_json) as PermissionObjectScope) : undefined,
  };
}

export function initializeAclSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS permission_objects (
      object_id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL,
      object_type INTEGER NOT NULL,
      creator_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      strategies_json TEXT NOT NULL,
      scope_json TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS permission_object_collaborators (
      object_id TEXT NOT NULL REFERENCES permission_objects(object_id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      role INTEGER NOT NULL CHECK (role IN (0, 1, 2)),
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (object_id, user_id)
    );
  `);
}

export function createAclRepository(database: Database.Database) {
  const insertObject = database.prepare(
    `INSERT INTO permission_objects (
      object_id, unit_id, object_type, creator_user_id, name,
      strategies_json, scope_json, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const findObject = database.prepare(
    `SELECT object_id, unit_id, object_type, creator_user_id, name, strategies_json, scope_json
    FROM permission_objects WHERE unit_id = ? AND object_id = ?`,
  );
  const updateObject = database.prepare(
    `UPDATE permission_objects SET name = ?, strategies_json = ?, scope_json = ?, updated_at_ms = ?
    WHERE unit_id = ? AND object_id = ?`,
  );
  const deleteCollaborators = database.prepare(
    "DELETE FROM permission_object_collaborators WHERE object_id = ?",
  );
  const upsertCollaborator = database.prepare(
    `INSERT INTO permission_object_collaborators (object_id, user_id, role, created_at_ms, updated_at_ms)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(object_id, user_id) DO UPDATE SET role = excluded.role, updated_at_ms = excluded.updated_at_ms`,
  );
  const findCollaborator = database.prepare(
    "SELECT role FROM permission_object_collaborators WHERE object_id = ? AND user_id = ?",
  );
  const allCollaborators = database.prepare(
    "SELECT user_id, role FROM permission_object_collaborators WHERE object_id = ? ORDER BY user_id",
  );
  function setCollaborators(objectId: string, collaborators: readonly ObjectCollaborator[]) {
    const now = Date.now();
    for (const collaborator of collaborators) {
      upsertCollaborator.run(objectId, collaborator.userId, collaborator.role, now, now);
    }
  }

  return {
    /** Creates the object and its collaborators atomically. */
    createObject(object: PermissionObject, collaborators: readonly ObjectCollaborator[]) {
      database.transaction(() => {
        const now = Date.now();
        insertObject.run(
          object.objectId,
          object.unitId,
          object.objectType,
          object.creatorUserId,
          object.name,
          JSON.stringify(object.strategies),
          object.scope ? JSON.stringify(object.scope) : null,
          now,
          now,
        );
        setCollaborators(object.objectId, collaborators);
      })();
    },
    getObject(unitId: string, objectId: string) {
      const row = findObject.get(unitId, objectId) as ObjectRow | undefined;
      return row ? toObject(row) : undefined;
    },
    listObjects(unitId: string, objectIds: readonly string[]) {
      return [...new Set(objectIds)].flatMap((objectId) => {
        const object = this.getObject(unitId, objectId);
        return object ? [object] : [];
      });
    },
    updateObject(input: {
      unitId: string;
      objectId: string;
      name: string;
      strategies: readonly PermissionStrategy[];
      scope: PermissionObjectScope | undefined;
      collaborators: readonly ObjectCollaborator[] | undefined;
    }) {
      database.transaction(() => {
        updateObject.run(
          input.name,
          JSON.stringify(input.strategies),
          input.scope ? JSON.stringify(input.scope) : null,
          Date.now(),
          input.unitId,
          input.objectId,
        );
        if (input.collaborators !== undefined) {
          deleteCollaborators.run(input.objectId);
          setCollaborators(input.objectId, input.collaborators);
        }
      })();
    },
    listCollaborators(objectId: string): ObjectCollaborator[] {
      return (allCollaborators.all(objectId) as { user_id: string; role: UnitRole }[]).map(
        (row) => ({ userId: row.user_id, role: row.role }),
      );
    },
    resolveCollaboratorRole(objectId: string, userId: string) {
      const row = findCollaborator.get(objectId, userId) as { role: UnitRole } | undefined;
      return row?.role;
    },
  };
}

export type AclRepository = ReturnType<typeof createAclRepository>;
