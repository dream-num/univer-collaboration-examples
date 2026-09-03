import type {
  IAllowedRequest,
  ICreateCollaboratorRequest,
  ICreateRequest,
  IDeleteCollaboratorRequest,
  IListPermPointRequest,
  IPutCollaboratorsRequest,
  IUpdateCollaboratorRequest,
  IUpdatePermPointRequest,
} from "@univerjs/protocol";
import {
  ErrorCode,
  UnitAction,
  UnitRole,
} from "@univerjs/protocol";
import {
  Router,
  type Request,
  type Response,
  type Router as ExpressRouter,
} from "express";
import type { User } from "../../shared/api-types";
import { AuthzError, type AuthzService } from "./authz.service";

const ok = { code: ErrorCode.OK, message: "" } as const;

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

function assertRouteIdentity(
  request: Request,
  body: { objectType: number; objectID?: string },
) {
  if (
    Number(textParam(request.params.objectType)) !== body.objectType ||
    (body.objectID !== undefined &&
      textParam(request.params.objectId) !== body.objectID)
  ) {
    throw new AuthzError(400, "INVALID_REQUEST", "Route identity mismatch");
  }
}

export function createAuthzRouter(options: {
  service: AuthzService;
  requireUser: (request: Request, response: Response) => User | undefined;
}): ExpressRouter {
  const router = Router();

  router.post("/-/object/-/batch_allowed", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as { requests?: IAllowedRequest[] };
    response.json({
      error: ok,
      objectActions: options.service.batchAllowed(
        user.userId,
        body.requests ?? [],
      ),
    });
  });

  router.post("/-/object/list", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    response.json({
      error: ok,
      objects: options.service.list(
        user.userId,
        request.body as IListPermPointRequest,
      ),
    });
  });

  router.post("/:objectType/object", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as ICreateRequest;
    assertRouteIdentity(request, body);
    response.json({
      error: ok,
      objectID: options.service.create(user.userId, body),
    });
  });

  router.put("/:objectType/object/:objectId", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IUpdatePermPointRequest;
    assertRouteIdentity(request, body);
    options.service.update(user.userId, body);
    response.json({ error: ok });
  });

  router.post(
    "/:objectType/object/:objectId/allowed",
    (request, response) => {
      const user = options.requireUser(request, response);
      if (!user) return;
      const body = request.body as IAllowedRequest;
      assertRouteIdentity(request, body);
      response.json({
        error: ok,
        actions: options.service.allowed(user.userId, body),
      });
    },
  );

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
      defaultStrategies: [
        { role: UnitRole.Reader, action: UnitAction.View },
        { role: UnitRole.Editor, action: UnitAction.Edit },
        { role: UnitRole.Owner, action: UnitAction.ManageCollaborator },
        { role: UnitRole.Owner, action: UnitAction.Delete },
      ],
    });
  });

  router.get("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    response.json({
      error: ok,
      collaborators: options.service.listCollaborators(
        user.userId,
        textParam(request.query.unitID as string | string[] | undefined),
        textParam(request.query.objectID as string | string[] | undefined),
      ),
      cfgEnableObjInherit: false,
    });
  });

  router.post("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as ICreateCollaboratorRequest;
    options.service.createCollaborators(
      user.userId,
      body.unitID,
      body.objectID,
      body.collaborators,
    );
    response.json({ error: ok });
  });

  router.patch("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IUpdateCollaboratorRequest;
    options.service.updateCollaborator(
      user.userId,
      body.unitID,
      body.objectID,
      body.collaborator,
    );
    response.json({ error: ok });
  });

  router.put("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body = request.body as IPutCollaboratorsRequest;
    options.service.putCollaborators(
      user.userId,
      body.unitID,
      body.objectID,
      body.collaborators,
    );
    response.json({ error: ok });
  });

  router.delete("/collaborator", (request, response) => {
    const user = options.requireUser(request, response);
    if (!user) return;
    const body: IDeleteCollaboratorRequest = {
      unitID: textParam(request.query.unitID as string | string[] | undefined),
      objectID: textParam(
        request.query.objectID as string | string[] | undefined,
      ),
      collaboratorID: textParam(
        request.query.collaboratorID as string | string[] | undefined,
      ),
    };
    options.service.deleteCollaborator(
      user.userId,
      body.unitID,
      body.objectID,
      body.collaboratorID,
    );
    response.json({ error: ok });
  });

  return router;
}
