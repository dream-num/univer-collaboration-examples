import { randomUUID } from "node:crypto";
import type {
  IAllowedRequest,
  ICreateCollaboratorRequest,
  ICreateRequest,
  IDeleteCollaboratorRequest,
  IListPermPointRequest,
  IPermissionPoint,
  IPutCollaboratorsRequest,
  IUpdateCollaboratorRequest,
  IUpdatePermPointRequest,
} from "@univerjs/protocol";
import { ErrorCode, UnitAction, UnitObject, UnitRole } from "@univerjs/protocol";
import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import {
  AuthzError,
  defaultStrategies,
  isObjectActionAllowed,
  normalizeCollaborators,
  normalizeScope,
  normalizeStrategies,
  toCollaborator,
  toUser,
  type AclStore,
} from "./acl";
import { isUnitActionAllowed, UNIT_ID } from "./permissions";
import type { DemoUser } from "../shared/types";

const ok = { code: ErrorCode.OK, message: "" } as const;

/** The actions the client permission panel offers for Sheet protection objects. */
const objectActions = [
  UnitAction.View,
  UnitAction.Edit,
  UnitAction.ManageCollaborator,
  UnitAction.Delete,
  UnitAction.Copy,
  UnitAction.InsertHyperlink,
  UnitAction.Sort,
  UnitAction.Filter,
  UnitAction.PivotTable,
  UnitAction.SetCellStyle,
  UnitAction.SetCellValue,
  UnitAction.SetRowStyle,
  UnitAction.SetColumnStyle,
  UnitAction.InsertRow,
  UnitAction.InsertColumn,
  UnitAction.DeleteRow,
  UnitAction.DeleteColumn,
  UnitAction.EditExtraObject,
] as const;

function textParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function assertRouteIdentity(request: Request, body: { objectType: number; objectID?: string }) {
  if (
    Number(textParam(request.params.objectType)) !== body.objectType ||
    (body.objectID !== undefined && textParam(request.params.objectId) !== body.objectID)
  ) {
    throw new AuthzError(400, "INVALID_REQUEST", "Route identity mismatch");
  }
}

/**
 * The HTTP contract the collaboration client calls for in-document permissions:
 * permission checks (batch_allowed), object management, and collaborator management.
 * The same `isObjectActionAllowed` answers both these queries and the server-side
 * enforcement, so what the UI shows always matches what the Service rejects.
 */
export function createAuthzRouter(options: {
  store: AclStore;
  requireUser: (request: Request, response: Response) => DemoUser | undefined;
}): ExpressRouter {
  const { store } = options;
  const router = Router();

  function assertUnitAction(userId: string, unitId: string, action: UnitAction) {
    if (unitId !== UNIT_ID || !isUnitActionAllowed(userId, unitId, action)) {
      throw new AuthzError(403, "PERMISSION_DENIED", "Permission denied");
    }
  }

  function allowed(userId: string, request: IAllowedRequest) {
    return request.actions.map((action) => ({
      action,
      allowed: isObjectActionAllowed(store, userId, {
        unitID: request.unitID,
        objectID: request.objectID,
        objectType: request.objectType,
        action,
      }),
    }));
  }

  function requireManagedObject(userId: string, unitId: string, objectId: string) {
    const object = store.getObject(unitId, objectId);
    if (!object) throw new AuthzError(404, "OBJECT_NOT_FOUND", "Permission object not found");
    if (
      !isObjectActionAllowed(store, userId, {
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

  // The client batches permission checks to render the toolbar and gate editing.
  router.post("/-/object/-/batch_allowed", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as { requests?: IAllowedRequest[] };
    response.json({
      error: ok,
      objectActions: (body.requests ?? []).map((item) => ({
        unitID: item.unitID,
        objectID: item.objectID,
        actions: allowed(user.userId, item),
      })),
    });
  });

  router.post("/-/object/list", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IListPermPointRequest;
    assertUnitAction(user.userId, body.unitID, UnitAction.View);
    const objects: IPermissionPoint[] = store
      .listObjects(body.unitID, body.objectIDs)
      .map((object) => ({
        objectID: object.objectId,
        unitID: object.unitId,
        objectType: object.objectType,
        name: object.name,
        shareOn: false,
        shareRole: UnitRole.Owner,
        creator: toUser(object.creatorUserId),
        strategies: object.strategies,
        actions: allowed(user.userId, {
          unitID: object.unitId,
          objectID: object.objectId,
          objectType: object.objectType,
          actions: body.actions,
        }),
        shareScope: 0,
        scope: object.scope,
      }));
    response.json({ error: ok, objects });
  });

  router.post("/:objectType/object", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as ICreateRequest;
    assertRouteIdentity(request, body);

    let input: { unitID: string; name: string; strategies: typeof defaultStrategies; scope?: Parameters<typeof normalizeScope>[0]; collaborators: readonly import("@univerjs/protocol").ICollaborator[] };
    if (body.objectType === UnitObject.SelectRange) {
      if (!body.selectRangeObject) {
        throw new AuthzError(400, "INVALID_REQUEST", "Missing range object");
      }
      input = { ...body.selectRangeObject, strategies: defaultStrategies };
    } else if (body.objectType === UnitObject.Worksheet) {
      if (!body.worksheetObject) {
        throw new AuthzError(400, "INVALID_REQUEST", "Missing worksheet object");
      }
      input = body.worksheetObject;
    } else {
      throw new AuthzError(400, "UNSUPPORTED_OBJECT_TYPE", "Unsupported permission object type");
    }
    // Creating a protection object is a Unit-level decision; the object afterwards
    // belongs to its creator.
    assertUnitAction(user.userId, input.unitID, UnitAction.CreatePermissionObject);

    const objectId = randomUUID();
    store.createObject(
      {
        objectId,
        unitId: input.unitID,
        objectType: body.objectType,
        creatorUserId: user.userId,
        name: input.name,
        strategies: normalizeStrategies(input.strategies),
        scope: normalizeScope(input.scope),
      },
      normalizeCollaborators(input.unitID, user.userId, input.collaborators),
    );
    response.json({ error: ok, objectID: objectId });
  });

  router.put("/:objectType/object/:objectId", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IUpdatePermPointRequest;
    assertRouteIdentity(request, body);
    const object = requireManagedObject(user.userId, body.unitID, body.objectID);
    if (object.objectType !== body.objectType) {
      throw new AuthzError(400, "INVALID_REQUEST", "Object type mismatch");
    }
    store.updateObject({
      unitId: object.unitId,
      objectId: object.objectId,
      name: body.name,
      strategies: body.strategies.length ? normalizeStrategies(body.strategies) : object.strategies,
      scope: normalizeScope(body.scope),
      collaborators: body.collaborators
        ? normalizeCollaborators(object.unitId, object.creatorUserId, body.collaborators.collaborators)
        : undefined,
    });
    // The Service reads policies on every submission, so edits apply to new changesets at once.
    // Already-connected clients learn about policy changes on their next batch_allowed query;
    // production apps should push UPDATE_PERMISSION_OBJ-style notifications instead.
    response.json({ error: ok });
  });

  router.post("/:objectType/object/:objectId/allowed", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IAllowedRequest;
    assertRouteIdentity(request, body);
    response.json({ error: ok, actions: allowed(user.userId, body) });
  });

  router.post("/:objectType/role", (request, response) => {
    if (!options.requireUser(request, response)) return;
    response.json({
      error: ok,
      roles: [
        { role: UnitRole.Reader, name: "Reader" },
        { role: UnitRole.Editor, name: "Editor" },
        { role: UnitRole.Owner, name: "Owner" },
      ],
      actions: objectActions,
      defaultStrategies,
    });
  });

  router.get("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const unitId = textParam(request.query.unitID as string | string[] | undefined);
    const objectId = textParam(request.query.objectID as string | string[] | undefined);
    assertUnitAction(user.userId, unitId, UnitAction.View);
    const object = store.getObject(unitId, objectId);
    if (!object) throw new AuthzError(404, "OBJECT_NOT_FOUND", "Permission object not found");
    response.json({
      error: ok,
      collaborators: store.listCollaborators(objectId).map(toCollaborator),
      cfgEnableObjInherit: false,
    });
  });

  router.post("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as ICreateCollaboratorRequest;
    const object = requireManagedObject(user.userId, body.unitID, body.objectID);
    for (const collaborator of normalizeCollaborators(object.unitId, object.creatorUserId, body.collaborators)) {
      store.setCollaborator(object.objectId, collaborator);
    }
    response.json({ error: ok });
  });

  router.patch("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IUpdateCollaboratorRequest;
    if (!body.collaborator) throw new AuthzError(400, "INVALID_REQUEST", "Missing collaborator");
    const object = requireManagedObject(user.userId, body.unitID, body.objectID);
    const [collaborator] = normalizeCollaborators(object.unitId, object.creatorUserId, [body.collaborator]);
    if (!collaborator) throw new AuthzError(400, "INVALID_COLLABORATOR", "Invalid collaborator");
    store.setCollaborator(object.objectId, collaborator);
    response.json({ error: ok });
  });

  router.put("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IPutCollaboratorsRequest;
    const object = requireManagedObject(user.userId, body.unitID, body.objectID);
    store.replaceCollaborators(
      object.objectId,
      normalizeCollaborators(object.unitId, object.creatorUserId, body.collaborators),
    );
    response.json({ error: ok });
  });

  router.delete("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const unitId = textParam(request.query.unitID as string | string[] | undefined);
    const objectId = textParam(request.query.objectID as string | string[] | undefined);
    const collaboratorId = textParam(request.query.collaboratorID as string | string[] | undefined);
    const object = requireManagedObject(user.userId, unitId, objectId);
    store.removeCollaborator(object.objectId, collaboratorId);
    response.json({ error: ok });
  });

  return router;
}
