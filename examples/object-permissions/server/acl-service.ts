import { randomUUID } from "node:crypto";
import { ObjectScope, UnitAction, UnitObject, UnitRole, type ICollaborator } from "@univerjs/protocol";
import type { AclRepository } from "./acl-repository";
import type { ObjectCollaborator, PermissionObject, PermissionObjectScope, PermissionStrategy } from "./acl-types";
import { isUnitActionAllowed, listUnitMembers, resolveUnitRole, UNIT_ID } from "./permissions";

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

interface ObjectActionRequest {
  unitID: string;
  objectID: string;
  objectType: UnitObject;
  action: UnitAction;
}

interface ObjectInput {
  unitID: string;
  objectType: UnitObject;
  name: string;
  strategies: readonly PermissionStrategy[];
  scope: PermissionObjectScope | undefined;
}

export class AclService {
  constructor(private readonly repository: AclRepository) {}

  isObjectActionAllowed(userId: string, request: ObjectActionRequest): boolean {
    const { unitID, objectID, objectType, action } = request;
    if (objectID === unitID) {
      return isUnitActionAllowed(userId, unitID, action);
    }
    if (objectType !== UnitObject.Worksheet && objectType !== UnitObject.SelectRange) {
      return false;
    }
    const envelope = action === UnitAction.View ? UnitAction.View : UnitAction.Edit;
    if (!isUnitActionAllowed(userId, unitID, envelope)) return false;

    const object = this.repository.getObject(unitID, objectID);
    if (!object || object.objectType !== objectType) return false;
    // Reusing an existing permission object as a binding target requires managing it.
    if (action === UnitAction.CreatePermissionObject) return object.creatorUserId === userId;

    const role = this.resolveObjectRole(userId, object, action);
    return role !== undefined && roleRank[role] >= roleRank[minimumObjectRole(object, action)];
  }

  listObjects(userId: string, unitId: string, objectIds: readonly string[]) {
    this.assertUnitAction(userId, unitId, UnitAction.View);
    return this.repository.listObjects(unitId, objectIds);
  }

  listCollaborators(userId: string, unitId: string, objectId: string) {
    this.assertUnitAction(userId, unitId, UnitAction.View);
    if (objectId === unitId) return listUnitMembers(unitId);
    if (!this.repository.getObject(unitId, objectId)) {
      throw new AuthzError(404, "OBJECT_NOT_FOUND", "Permission object not found");
    }
    return this.repository.listCollaborators(objectId);
  }

  createObject(userId: string, input: ObjectInput & { collaborators: readonly ICollaborator[] }) {
    // Creating a protection object is a Unit-level decision; the object afterwards
    // belongs to its creator.
    this.assertUnitAction(userId, input.unitID, UnitAction.CreatePermissionObject);

    const objectId = randomUUID();
    this.repository.createObject(
      {
        objectId,
        unitId: input.unitID,
        objectType: input.objectType,
        creatorUserId: userId,
        name: input.name,
        strategies: normalizeStrategies(input.strategies),
        scope: normalizeScope(input.scope),
      },
      normalizeCollaborators(input.unitID, userId, input.collaborators),
    );
    return objectId;
  }

  updateObject(userId: string, input: ObjectInput & { objectID: string; collaborators: readonly ICollaborator[] | undefined }) {
    const object = this.requireManagedObject(userId, input.unitID, input.objectID);
    if (object.objectType !== input.objectType) {
      throw new AuthzError(400, "INVALID_REQUEST", "Object type mismatch");
    }
    this.repository.updateObject({
      unitId: object.unitId,
      objectId: object.objectId,
      name: input.name,
      strategies: input.strategies.length ? normalizeStrategies(input.strategies) : object.strategies,
      scope: normalizeScope(input.scope),
      collaborators: input.collaborators
        ? normalizeCollaborators(object.unitId, object.creatorUserId, input.collaborators)
        : undefined,
    });
  }

  /** The object creator manages it; everyone else needs an explicit or scope-granted role. */
  private resolveObjectRole(
    userId: string,
    object: PermissionObject,
    action: UnitAction,
  ): UnitRole | undefined {
    if (object.creatorUserId === userId) return UnitRole.Owner;
    const explicit = this.repository.resolveCollaboratorRole(object.objectId, userId);
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

  private assertUnitAction(userId: string, unitId: string, action: UnitAction) {
    if (unitId !== UNIT_ID || !isUnitActionAllowed(userId, unitId, action)) {
      throw new AuthzError(403, "PERMISSION_DENIED", "Permission denied");
    }
  }

  private requireManagedObject(userId: string, unitId: string, objectId: string) {
    const object = this.repository.getObject(unitId, objectId);
    if (!object) throw new AuthzError(404, "OBJECT_NOT_FOUND", "Permission object not found");
    if (
      !this.isObjectActionAllowed(userId, {
        unitID: unitId,
        objectID: objectId,
        objectType: object.objectType,
        action: UnitAction.ManageCollaborator,
      })
    ) {
      throw new AuthzError(403, "PERMISSION_DENIED", "Permission denied");
    }
    return object;
  }
}

function minimumObjectRole(object: PermissionObject, action: UnitAction): UnitRole {
  if (action === UnitAction.ManageCollaborator || action === UnitAction.Delete) {
    return UnitRole.Owner;
  }
  return (
    object.strategies.find((strategy) => strategy.action === action)?.role ??
    (action === UnitAction.View ||
    action === UnitAction.Copy ||
    action === UnitAction.Comment ||
    action === UnitAction.ViewHistory
      ? UnitRole.Reader
      : UnitRole.Editor)
  );
}

function normalizeStrategies(strategies: readonly PermissionStrategy[]) {
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

function normalizeScope(scope: PermissionObjectScope | undefined) {
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
function normalizeCollaborators(
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
