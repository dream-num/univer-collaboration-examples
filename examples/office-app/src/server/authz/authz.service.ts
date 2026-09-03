import { randomUUID } from "node:crypto";
import type {
  IActionInfo,
  IAllowedRequest,
  ICollaborator,
  ICreateRequest,
  IListPermPointRequest,
  IPermissionPoint,
  IUpdatePermPointRequest,
  IUser,
} from "@univerjs/protocol";
import {
  ObjectScope,
  UnitAction,
  UnitObject,
  UnitRole,
  UniverType,
} from "@univerjs/protocol";
import { isUnitActionAllowed } from "../permissions";
import type { UnitRepository } from "../units/units.repository";
import type {
  AuthzRepository,
  PermissionObject,
  PermissionObjectCollaborator,
  PermissionObjectScope,
  PermissionStrategy,
} from "./authz.repository";

/**
 * This is a demo application policy. Real applications should define their own
 * role-to-permission mapping and may introduce roles such as "commenter".
 */
const objectRoleRank: Record<UnitRole, number> = {
  [UnitRole.Reader]: 0,
  [UnitRole.Editor]: 1,
  [UnitRole.Owner]: 2,
  [UnitRole.UNRECOGNIZED]: -1,
};

const defaultStrategies: PermissionStrategy[] = [
  { action: UnitAction.View, role: UnitRole.Reader },
  { action: UnitAction.Edit, role: UnitRole.Editor },
  { action: UnitAction.ManageCollaborator, role: UnitRole.Owner },
  { action: UnitAction.Delete, role: UnitRole.Owner },
];

const supportedObjectTypes = new Set<UnitObject>([
  UnitObject.Worksheet,
  UnitObject.SelectRange,
]);

const privateShareScope: IPermissionPoint["shareScope"] = 0;

export class AuthzError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createAuthzService(options: {
  repository: AuthzRepository;
  units: UnitRepository;
}) {
  function resolveUnitEnvelopeAction(action: UnitAction) {
    return action === UnitAction.View ? UnitAction.View : UnitAction.Edit;
  }

  function resolveObjectRole(
    userId: string,
    object: PermissionObject,
    action: UnitAction,
  ): UnitRole | undefined {
    if (object.creatorUserId === userId) return UnitRole.Owner;
    const explicit = options.repository.resolveCollaboratorRole(
      object.unitId,
      object.objectId,
      userId,
    );
    if (explicit !== undefined) return explicit;

    if (action === UnitAction.View) {
      return object.scope?.read === ObjectScope.AllCollaborator
        ? UnitRole.Reader
        : undefined;
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

  function minimumObjectRole(object: PermissionObject, action: UnitAction) {
    if (
      action === UnitAction.ManageCollaborator ||
      action === UnitAction.Delete
    ) {
      return UnitRole.Owner;
    }
    return (
      object.strategies.find((strategy) => strategy.action === action)?.role ??
      (action === UnitAction.View ? UnitRole.Reader : UnitRole.Editor)
    );
  }

  function isAllowed(userId: string, request: IAllowedRequest): boolean {
    const unitRole = options.units.resolveRole(userId, request.unitID);
    if (request.objectID === request.unitID) {
      return isUnitActionAllowed(unitRole, request.actions[0] ?? -1);
    }

    const action = request.actions[0];
    if (action === undefined || !supportedObjectTypes.has(request.objectType)) {
      return false;
    }
    if (!isUnitActionAllowed(unitRole, resolveUnitEnvelopeAction(action))) {
      return false;
    }

    const object = options.repository.getObject(
      request.unitID,
      request.objectID,
    );
    if (!object || object.objectType !== request.objectType) {
      return false;
    }
    if (action === UnitAction.CreatePermissionObject) {
      return object.creatorUserId === userId;
    }

    const role = resolveObjectRole(userId, object, action);
    return (
      role !== undefined &&
      objectRoleRank[role] >= objectRoleRank[minimumObjectRole(object, action)]
    );
  }

  function allowed(userId: string, request: IAllowedRequest): IActionInfo[] {
    return request.actions.map((action) => ({
      action,
      allowed: isAllowed(userId, { ...request, actions: [action] }),
    }));
  }

  function assertUnitAction(userId: string, unitId: string, action: UnitAction) {
    if (!isUnitActionAllowed(options.units.resolveRole(userId, unitId), action)) {
      throw new AuthzError(403, "PERMISSION_DENIED", "Permission denied");
    }
  }

  function assertObjectAction(
    userId: string,
    unitId: string,
    objectId: string,
    objectType: UnitObject,
    action: UnitAction,
  ) {
    if (
      !isAllowed(userId, {
        unitID: unitId,
        objectID: objectId,
        objectType,
        actions: [action],
      })
    ) {
      throw new AuthzError(403, "PERMISSION_DENIED", "Permission denied");
    }
  }

  function readCreateObject(request: ICreateRequest) {
    if (request.objectType === UnitObject.SelectRange) {
      if (!request.selectRangeObject) {
        throw new AuthzError(400, "INVALID_REQUEST", "Missing range object");
      }
      return {
        ...request.selectRangeObject,
        strategies: defaultStrategies,
      };
    }
    if (request.objectType === UnitObject.Worksheet) {
      if (!request.worksheetObject) {
        throw new AuthzError(
          400,
          "INVALID_REQUEST",
          "Missing worksheet object",
        );
      }
      return request.worksheetObject;
    }
    throw new AuthzError(
      400,
      "UNSUPPORTED_OBJECT_TYPE",
      "Only Worksheet and SelectRange are supported",
    );
  }

  function normalizeStrategies(
    strategies: readonly PermissionStrategy[],
  ): PermissionStrategy[] {
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

  function normalizeScope(
    scope: PermissionObjectScope | undefined,
  ): PermissionObjectScope | undefined {
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

  function normalizeCollaborators(
    unitId: string,
    creatorUserId: string,
    collaborators: readonly ICollaborator[],
  ): PermissionObjectCollaborator[] {
    const result = new Map<string, UnitRole>();
    for (const collaborator of collaborators) {
      const userId = collaborator.subject?.userID || collaborator.id;
      if (
        !userId ||
        userId === creatorUserId ||
        collaborator.role < UnitRole.Reader ||
        collaborator.role > UnitRole.Owner ||
        !options.units.resolveRole(userId, unitId)
      ) {
        throw new AuthzError(400, "INVALID_COLLABORATOR", "Invalid collaborator");
      }
      result.set(userId, collaborator.role);
    }
    return [...result].map(([userId, role]) => ({ userId, role }));
  }

  function toUser(userId: string): IUser | undefined {
    const user = options.units.getUsers([userId])[0];
    return user
      ? {
          userID: user.userId,
          name: user.displayName,
          avatar: "",
          anonymous: false,
          canBindAnonymous: false,
          phone: "",
          email: "",
          createTimestamp: user.createdAt,
        }
      : undefined;
  }

  function toCollaborators(
    collaborators: readonly PermissionObjectCollaborator[],
  ): ICollaborator[] {
    return collaborators.map((collaborator) => ({
      id: collaborator.userId,
      role: collaborator.role,
      subject: toUser(collaborator.userId),
    }));
  }

  function getObjectForManagement(
    userId: string,
    unitId: string,
    objectId: string,
  ) {
    const object = options.repository.getObject(unitId, objectId);
    if (!object) {
      throw new AuthzError(
        404,
        "OBJECT_NOT_FOUND",
        "Permission object not found",
      );
    }
    assertObjectAction(
      userId,
      unitId,
      objectId,
      object.objectType,
      UnitAction.ManageCollaborator,
    );
    return object;
  }

  return {
    isAllowed,
    allowed,
    batchAllowed(userId: string, requests: readonly IAllowedRequest[]) {
      return requests.map((request) => ({
        unitID: request.unitID,
        objectID: request.objectID,
        actions: allowed(userId, request),
      }));
    },
    create(userId: string, request: ICreateRequest) {
      const input = readCreateObject(request);
      const unit = options.units.getUnit(userId, input.unitID);
      if (!unit || unit.type !== UniverType.UNIVER_SHEET) {
        throw new AuthzError(404, "UNIT_NOT_FOUND", "Sheet not found");
      }
      assertUnitAction(userId, input.unitID, UnitAction.CreatePermissionObject);
      const objectId = randomUUID();
      options.repository.createObject({
        object: {
          objectId,
          unitId: input.unitID,
          objectType: request.objectType,
          creatorUserId: userId,
          name: input.name,
          strategies: normalizeStrategies(input.strategies),
          scope: normalizeScope(input.scope),
        },
        collaborators: normalizeCollaborators(
          input.unitID,
          userId,
          input.collaborators,
        ),
      });
      return objectId;
    },
    list(userId: string, request: IListPermPointRequest): IPermissionPoint[] {
      assertUnitAction(userId, request.unitID, UnitAction.View);
      return options.repository
        .listObjects(request.unitID, request.objectIDs)
        .map((object) => ({
          objectID: object.objectId,
          unitID: object.unitId,
          objectType: object.objectType,
          name: object.name,
          shareOn: false,
          shareRole: UnitRole.Owner,
          creator: toUser(object.creatorUserId),
          strategies: object.strategies,
          actions: allowed(userId, {
            objectID: object.objectId,
            objectType: object.objectType,
            unitID: object.unitId,
            actions: request.actions,
          }),
          shareScope: privateShareScope,
          scope: object.scope,
        }));
    },
    update(userId: string, request: IUpdatePermPointRequest) {
      const object = getObjectForManagement(
        userId,
        request.unitID,
        request.objectID,
      );
      if (object.objectType !== request.objectType) {
        throw new AuthzError(400, "INVALID_REQUEST", "Object type mismatch");
      }
      const strategies = request.strategies.length
        ? normalizeStrategies(request.strategies)
        : object.strategies;
      const collaborators = request.collaborators
        ? normalizeCollaborators(
            object.unitId,
            object.creatorUserId,
            request.collaborators.collaborators,
          )
        : undefined;
      options.repository.updateObject({
        unitId: object.unitId,
        objectId: object.objectId,
        name: request.name,
        strategies,
        scope: normalizeScope(request.scope),
        collaborators,
      });
    },
    listCollaborators(userId: string, unitId: string, objectId: string) {
      assertUnitAction(userId, unitId, UnitAction.View);
      if (objectId === unitId) {
        return options.units.listMembers(unitId).map((member) => ({
          id: member.userId,
          role:
            member.role === "creator"
              ? UnitRole.Owner
              : member.role === "editor"
                ? UnitRole.Editor
                : UnitRole.Reader,
          subject: toUser(member.userId),
        }));
      }
      const object = options.repository.getObject(unitId, objectId);
      if (!object) {
        throw new AuthzError(
          404,
          "OBJECT_NOT_FOUND",
          "Permission object not found",
        );
      }
      assertObjectAction(
        userId,
        unitId,
        objectId,
        object.objectType,
        UnitAction.View,
      );
      return toCollaborators(
        options.repository.listCollaborators(unitId, objectId),
      );
    },
    createCollaborators(
      userId: string,
      unitId: string,
      objectId: string,
      collaborators: readonly ICollaborator[],
    ) {
      const object = getObjectForManagement(userId, unitId, objectId);
      for (const collaborator of normalizeCollaborators(
        unitId,
        object.creatorUserId,
        collaborators,
      )) {
        options.repository.setCollaborator(unitId, objectId, collaborator);
      }
    },
    updateCollaborator(
      userId: string,
      unitId: string,
      objectId: string,
      collaborator: ICollaborator | undefined,
    ) {
      const object = getObjectForManagement(userId, unitId, objectId);
      if (!collaborator) {
        throw new AuthzError(400, "INVALID_REQUEST", "Missing collaborator");
      }
      const [normalized] = normalizeCollaborators(
        unitId,
        object.creatorUserId,
        [collaborator],
      );
      if (!normalized) {
        throw new AuthzError(400, "INVALID_COLLABORATOR", "Invalid collaborator");
      }
      options.repository.setCollaborator(unitId, objectId, normalized);
    },
    deleteCollaborator(
      userId: string,
      unitId: string,
      objectId: string,
      collaboratorId: string,
    ) {
      getObjectForManagement(userId, unitId, objectId);
      options.repository.removeCollaborator(unitId, objectId, collaboratorId);
    },
    putCollaborators(
      userId: string,
      unitId: string,
      objectId: string,
      collaborators: readonly ICollaborator[],
    ) {
      const object = getObjectForManagement(userId, unitId, objectId);
      options.repository.replaceCollaborators(
        unitId,
        objectId,
        normalizeCollaborators(
          unitId,
          object.creatorUserId,
          collaborators,
        ),
      );
    },
    deleteObject(unitId: string, objectId: string) {
      options.repository.deleteObject(unitId, objectId);
    },
  };
}

export type AuthzService = ReturnType<typeof createAuthzService>;
