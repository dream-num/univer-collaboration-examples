import type Database from "libsql";
import type { ICollaborator, IUser } from "@univerjs/protocol";
import { ObjectScope, UnitAction, UnitObject, UnitRole } from "@univerjs/protocol";
import { isUnitActionAllowed, resolveUnitRole } from "./permissions";
import { users } from "./users";

/**
 * The application-owned ACL store for in-document permission objects.
 *
 * The collaboration Service never stores ACLs: it only reports which
 * `UnitObject + UnitAction` a mutation requires. The application persists
 * permission objects (a protected worksheet or range), their strategies
 * (which role may perform which action) and per-object collaborators,
 * and answers both the client's authz queries and the server-side
 * enforcement in main.ts.
 *
 * This demo keeps Sheet objects only: `UnitObject.Worksheet` and
 * `UnitObject.SelectRange`. Doc, Slide, Board and Base reuse the same
 * protocol payloads with their own object types.
 */
export interface PermissionStrategy {
  action: UnitAction;
  role: UnitRole;
}

export interface PermissionObjectScope {
  read: ObjectScope;
  edit: ObjectScope;
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

export interface ObjectCollaborator {
  userId: string;
  role: UnitRole;
}

export const defaultStrategies: PermissionStrategy[] = [
  { action: UnitAction.View, role: UnitRole.Reader },
  { action: UnitAction.Edit, role: UnitRole.Editor },
  { action: UnitAction.ManageCollaborator, role: UnitRole.Owner },
  { action: UnitAction.Delete, role: UnitRole.Owner },
];

const roleRank: Record<UnitRole, number> = {
  [UnitRole.Reader]: 0,
  [UnitRole.Editor]: 1,
  [UnitRole.Owner]: 2,
  [UnitRole.UNRECOGNIZED]: -1,
};

export class AuthzError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
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

export function createAclStore(database: Database.Database) {
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
  const deleteCollaborator = database.prepare(
    "DELETE FROM permission_object_collaborators WHERE object_id = ? AND user_id = ?",
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
    setCollaborator(objectId: string, collaborator: ObjectCollaborator) {
      setCollaborators(objectId, [collaborator]);
    },
    replaceCollaborators(objectId: string, collaborators: readonly ObjectCollaborator[]) {
      database.transaction(() => {
        deleteCollaborators.run(objectId);
        setCollaborators(objectId, collaborators);
      })();
    },
    removeCollaborator(objectId: string, userId: string) {
      deleteCollaborator.run(objectId, userId);
    },
  };
}

export type AclStore = ReturnType<typeof createAclStore>;

/** The object creator manages it; everyone else needs an explicit or scope-granted role. */
function resolveObjectRole(
  store: AclStore,
  userId: string,
  object: PermissionObject,
  action: UnitAction,
): UnitRole | undefined {
  if (object.creatorUserId === userId) return UnitRole.Owner;
  const explicit = store.resolveCollaboratorRole(object.objectId, userId);
  if (explicit !== undefined) return explicit;

  if (action === UnitAction.View) {
    return object.scope?.read === ObjectScope.AllCollaborator ? UnitRole.Reader : undefined;
  }
  if (
    action !== UnitAction.ManageCollaborator &&
    action !== UnitAction.Delete &&
    object.scope?.edit === ObjectScope.AllCollaborator
  ) {
    return UnitRole.Editor;
  }
  return undefined;
}

function minimumObjectRole(object: PermissionObject, action: UnitAction): UnitRole {
  if (action === UnitAction.ManageCollaborator || action === UnitAction.Delete) {
    return UnitRole.Owner;
  }
  return (
    object.strategies.find((strategy) => strategy.action === action)?.role ??
    (action === UnitAction.View ? UnitRole.Reader : UnitRole.Editor)
  );
}

/**
 * Answers one `RequiredUnitPermission` (or one client authz query) against the ACL.
 * Requests for the workbook root use the Unit policy; object requests additionally
 * require the Unit envelope so a stray object grant never widens Unit access.
 */
export function isObjectActionAllowed(
  store: AclStore,
  userId: string,
  request: { unitID: string; objectID: string; objectType: UnitObject; action: UnitAction },
): boolean {
  const { unitID, objectID, objectType, action } = request;
  if (objectID === unitID) {
    return isUnitActionAllowed(userId, unitID, action);
  }
  if (objectType !== UnitObject.Worksheet && objectType !== UnitObject.SelectRange) {
    return false;
  }
  const envelope = action === UnitAction.View ? UnitAction.View : UnitAction.Edit;
  if (!isUnitActionAllowed(userId, unitID, envelope)) return false;

  const object = store.getObject(unitID, objectID);
  if (!object || object.objectType !== objectType) return false;
  // Reusing an existing permission object as a binding target requires managing it.
  if (action === UnitAction.CreatePermissionObject) return object.creatorUserId === userId;

  const role = resolveObjectRole(store, userId, object, action);
  return role !== undefined && roleRank[role] >= roleRank[minimumObjectRole(object, action)];
}

export function toUser(userId: string): IUser | undefined {
  const user = users.find((user) => user.userId === userId);
  return user
    ? {
        userID: user.userId,
        name: user.username,
        avatar: user.avatar,
        anonymous: false,
        canBindAnonymous: false,
        phone: "",
        email: "",
        createTimestamp: 0,
      }
    : undefined;
}

export function toCollaborator(entry: ObjectCollaborator): ICollaborator {
  return { id: entry.userId, role: entry.role, subject: toUser(entry.userId) };
}

export function normalizeStrategies(strategies: readonly PermissionStrategy[]) {
  const result = new Map<UnitAction, UnitRole>();
  for (const strategy of strategies) {
    if (
      !Number.isInteger(strategy.action) ||
      !Number.isInteger(strategy.role) ||
      strategy.role < UnitRole.Reader ||
      strategy.role > UnitRole.Owner
    ) {
      throw new AuthzError(400, "INVALID_REQUEST", "Invalid strategy");
    }
    result.set(strategy.action, strategy.role);
  }
  return [...result].map(([action, role]) => ({ action, role }));
}

export function normalizeScope(scope: PermissionObjectScope | undefined) {
  if (!scope) return undefined;
  const valid = new Set<ObjectScope>([
    ObjectScope.SomeCollaborator,
    ObjectScope.AllCollaborator,
    ObjectScope.OneSelf,
  ]);
  if (!valid.has(scope.read) || !valid.has(scope.edit)) {
    throw new AuthzError(400, "INVALID_REQUEST", "Invalid object scope");
  }
  return { read: scope.read, edit: scope.edit };
}

/** Collaborators must be Unit members; the object creator is always the Owner. */
export function normalizeCollaborators(
  unitId: string,
  creatorUserId: string,
  collaborators: readonly ICollaborator[],
): ObjectCollaborator[] {
  const result = new Map<string, UnitRole>();
  for (const collaborator of collaborators) {
    const userId = collaborator.subject?.userID || collaborator.id;
    if (
      !userId ||
      userId === creatorUserId ||
      collaborator.role < UnitRole.Reader ||
      collaborator.role > UnitRole.Owner ||
      !resolveUnitRole(userId, unitId)
    ) {
      throw new AuthzError(400, "INVALID_COLLABORATOR", "Invalid collaborator");
    }
    result.set(userId, collaborator.role);
  }
  return [...result].map(([userId, role]) => ({ userId, role }));
}
