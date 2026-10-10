import type Database from "libsql";
import type {
  ObjectScope,
  UnitAction,
  UnitObject,
  UnitRole,
} from "@univerjs/protocol";

export interface PermissionStrategy {
  action: UnitAction;
  role: UnitRole;
}

export interface PermissionObjectScope {
  edit: ObjectScope;
  read: ObjectScope;
}

export interface PermissionObject {
  objectId: string;
  unitId: string;
  objectType: UnitObject;
  creatorUserId: string;
  name: string;
  strategies: PermissionStrategy[];
  scope: PermissionObjectScope | undefined;
}

export interface PermissionObjectCollaborator {
  userId: string;
  role: UnitRole;
}

interface ObjectRow {
  object_id: string;
  unit_id: string;
  object_type: UnitObject;
  creator_user_id: string;
  name: string;
  strategies_json: string;
  scope_json: string | null;
}

interface CollaboratorRow {
  user_id: string;
  role: UnitRole;
}

function toObject(row: ObjectRow): PermissionObject {
  return {
    objectId: row.object_id,
    unitId: row.unit_id,
    objectType: row.object_type,
    creatorUserId: row.creator_user_id,
    name: row.name,
    strategies: JSON.parse(row.strategies_json) as PermissionStrategy[],
    scope: row.scope_json
      ? (JSON.parse(row.scope_json) as PermissionObjectScope)
      : undefined,
  };
}

export function createAuthzRepository(database: Database.Database) {
  const insertObject = database.prepare(
    `INSERT INTO app_permission_objects (
      object_id, unit_id, object_type, creator_user_id, name,
      strategies_json, scope_json, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const findObject = database.prepare(
    `SELECT object_id, unit_id, object_type, creator_user_id, name,
      strategies_json, scope_json
    FROM app_permission_objects
    WHERE unit_id = ? AND object_id = ?`,
  );
  const updateObject = database.prepare(
    `UPDATE app_permission_objects
    SET name = ?, strategies_json = ?, scope_json = ?, updated_at_ms = ?
    WHERE unit_id = ? AND object_id = ?`,
  );
  const deleteObject = database.prepare(
    `DELETE FROM app_permission_objects
    WHERE unit_id = ? AND object_id = ?`,
  );
  const listCollaborators = database.prepare(
    `SELECT user_id, role
    FROM app_permission_object_collaborators
    WHERE unit_id = ? AND object_id = ?
    ORDER BY user_id`,
  );
  const findCollaborator = database.prepare(
    `SELECT user_id, role
    FROM app_permission_object_collaborators
    WHERE unit_id = ? AND object_id = ? AND user_id = ?`,
  );
  const upsertCollaborator = database.prepare(
    `INSERT INTO app_permission_object_collaborators (
      unit_id, object_id, user_id, role, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(unit_id, object_id, user_id) DO UPDATE SET
      role = excluded.role,
      updated_at_ms = excluded.updated_at_ms`,
  );
  const deleteCollaborator = database.prepare(
    `DELETE FROM app_permission_object_collaborators
    WHERE unit_id = ? AND object_id = ? AND user_id = ?`,
  );
  const deleteCollaborators = database.prepare(
    `DELETE FROM app_permission_object_collaborators
    WHERE unit_id = ? AND object_id = ?`,
  );

  const replaceCollaborators = database.transaction(
    (
      unitId: string,
      objectId: string,
      collaborators: readonly PermissionObjectCollaborator[],
    ) => {
      deleteCollaborators.run(unitId, objectId);
      const now = Date.now();
      for (const collaborator of collaborators) {
        upsertCollaborator.run(
          unitId,
          objectId,
          collaborator.userId,
          collaborator.role,
          now,
          now,
        );
      }
    },
  );

  const insertObjectWithCollaborators = database.transaction(
    (input: {
      object: PermissionObject;
      collaborators: readonly PermissionObjectCollaborator[];
    }) => {
      const now = Date.now();
      insertObject.run(
        input.object.objectId,
        input.object.unitId,
        input.object.objectType,
        input.object.creatorUserId,
        input.object.name,
        JSON.stringify(input.object.strategies),
        input.object.scope ? JSON.stringify(input.object.scope) : null,
        now,
        now,
      );
      for (const collaborator of input.collaborators) {
        upsertCollaborator.run(
          input.object.unitId,
          input.object.objectId,
          collaborator.userId,
          collaborator.role,
          now,
          now,
        );
      }
    },
  );

  const updateObjectWithCollaborators = database.transaction(
    (input: {
      unitId: string;
      objectId: string;
      name: string;
      strategies: readonly PermissionStrategy[];
      scope: PermissionObjectScope | undefined;
      collaborators: readonly PermissionObjectCollaborator[] | undefined;
    }) => {
      const now = Date.now();
      const result = updateObject.run(
        input.name,
        JSON.stringify(input.strategies),
        input.scope ? JSON.stringify(input.scope) : null,
        now,
        input.unitId,
        input.objectId,
      ) as { changes: number };
      if (result.changes !== 1 || input.collaborators === undefined) {
        return result.changes === 1;
      }
      deleteCollaborators.run(input.unitId, input.objectId);
      for (const collaborator of input.collaborators) {
        upsertCollaborator.run(
          input.unitId,
          input.objectId,
          collaborator.userId,
          collaborator.role,
          now,
          now,
        );
      }
      return true;
    },
  );

  return {
    createObject(input: {
      object: PermissionObject;
      collaborators: readonly PermissionObjectCollaborator[];
    }) {
      insertObjectWithCollaborators(input);
    },
    getObject(unitId: string, objectId: string): PermissionObject | undefined {
      const row = findObject.get(unitId, objectId) as ObjectRow | undefined;
      return row ? toObject(row) : undefined;
    },
    listObjects(unitId: string, objectIds: readonly string[]) {
      return [...new Set(objectIds)].flatMap((objectId) => {
        const row = findObject.get(unitId, objectId) as ObjectRow | undefined;
        return row ? [toObject(row)] : [];
      });
    },
    updateObject(input: {
      unitId: string;
      objectId: string;
      name: string;
      strategies: readonly PermissionStrategy[];
      scope: PermissionObjectScope | undefined;
      collaborators: readonly PermissionObjectCollaborator[] | undefined;
    }) {
      return updateObjectWithCollaborators(input);
    },
    deleteObject(unitId: string, objectId: string) {
      deleteObject.run(unitId, objectId);
    },
    listCollaborators(unitId: string, objectId: string) {
      return (listCollaborators.all(unitId, objectId) as CollaboratorRow[]).map(
        (row): PermissionObjectCollaborator => ({
          userId: row.user_id,
          role: row.role,
        }),
      );
    },
    resolveCollaboratorRole(unitId: string, objectId: string, userId: string) {
      const row = findCollaborator.get(
        unitId,
        objectId,
        userId,
      ) as CollaboratorRow | undefined;
      return row?.role;
    },
    replaceCollaborators(
      unitId: string,
      objectId: string,
      collaborators: readonly PermissionObjectCollaborator[],
    ) {
      replaceCollaborators(unitId, objectId, collaborators);
    },
    setCollaborator(
      unitId: string,
      objectId: string,
      collaborator: PermissionObjectCollaborator,
    ) {
      const now = Date.now();
      upsertCollaborator.run(
        unitId,
        objectId,
        collaborator.userId,
        collaborator.role,
        now,
        now,
      );
    },
    removeCollaborator(unitId: string, objectId: string, userId: string) {
      deleteCollaborator.run(unitId, objectId, userId);
    },
  };
}

export type AuthzRepository = ReturnType<typeof createAuthzRepository>;
