import type {
  IAllowedRequest,
  ICollaborator,
  IUser,
  ICreateRequest,
  IListPermPointRequest,
  IPermissionPoint,
  IUpdatePermPointRequest,
} from "@univerjs/protocol";
import { ErrorCode, UnitObject, UnitRole } from "@univerjs/protocol";
import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { AuthzError, defaultStrategies, type AclService } from "./acl-service";
import type { ObjectCollaborator } from "./acl-types";
import { users } from "./users";
import type { DemoUser } from "../shared/types";

const ok = { code: ErrorCode.OK, message: "" } as const;

function toUser(userId: string): IUser | undefined {
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

function toCollaborator(entry: ObjectCollaborator): ICollaborator {
  return { id: entry.userId, role: entry.role, subject: toUser(entry.userId) };
}

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
 * The HTTP contract the sheet permission panel calls: batch_allowed, object list,
 * create, update, and GET /collaborator. Collaborators, scope, and strategies travel
 * on create and update. The same `isObjectActionAllowed` answers these queries and
 * the server-side enforcement, so what the UI shows matches what the Service rejects.
 */
export function createAuthzRouter(options: {
  service: AclService;
  requireUser: (request: Request, response: Response) => DemoUser | undefined;
}): ExpressRouter {
  const { service } = options;
  const router = Router();

  function allowed(userId: string, request: IAllowedRequest) {
    return request.actions.map((action) => ({
      action,
      allowed: service.isObjectActionAllowed(userId, {
        unitID: request.unitID,
        objectID: request.objectID,
        objectType: request.objectType,
        action,
      }),
    }));
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
    const objects: IPermissionPoint[] = service
      .listObjects(user.userId, body.unitID, body.objectIDs)
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

    let objectId: string;
    if (body.objectType === UnitObject.SelectRange) {
      if (!body.selectRangeObject) throw new AuthzError(400, "INVALID_REQUEST", "Missing range object");
      objectId = service.createObject(user.userId, {
        ...body.selectRangeObject, objectType: body.objectType, strategies: defaultStrategies,
      });
    } else if (body.objectType === UnitObject.Worksheet) {
      if (!body.worksheetObject) throw new AuthzError(400, "INVALID_REQUEST", "Missing worksheet object");
      objectId = service.createObject(user.userId, { ...body.worksheetObject, objectType: body.objectType });
    } else {
      throw new AuthzError(400, "UNSUPPORTED_OBJECT_TYPE", "Unsupported permission object type");
    }
    response.json({ error: ok, objectID: objectId });
  });

  router.put("/:objectType/object/:objectId", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IUpdatePermPointRequest;
    assertRouteIdentity(request, body);
    service.updateObject(user.userId, { ...body, collaborators: body.collaborators?.collaborators });
    // The Service reads policies on every submission, so edits apply to new changesets at once.
    // Already-connected clients learn about policy changes on their next batch_allowed query;
    // production apps should push UPDATE_PERMISSION_OBJ-style notifications instead.
    response.json({ error: ok });
  });

  router.get("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const unitId = textParam(request.query.unitID as string | string[] | undefined);
    const objectId = textParam(request.query.objectID as string | string[] | undefined);
    response.json({
      error: ok,
      collaborators: service.listCollaborators(user.userId, unitId, objectId).map(toCollaborator),
      cfgEnableObjInherit: false,
    });
  });

  return router;
}
