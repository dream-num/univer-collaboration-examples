import { randomUUID } from "node:crypto";
import type {
  CollabSession,
  UniverCollabService,
} from "@univerjs/collaboration-service";
import { CollabError } from "@univerjs/collaboration-service";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import { json, Router } from "express";
import type { AuthService } from "./auth.js";
import type { DemoUser } from "./demo-user.js";
import { protocolUser } from "./demo-user.js";
import type { ProductStore } from "./product-store.js";
import {
  CREATABLE_UNIT_TYPES,
  createInitialUnitData,
  isCreatableUnitType,
} from "./unit-data.js";

const OK_ERROR = { code: ErrorCode.OK, message: "" };

export interface ApplicationRouterDependencies {
  readonly collabService: UniverCollabService;
  readonly productStore: ProductStore;
  readonly authService: AuthService;
}

export function createApplicationRouter(
  dependencies: ApplicationRouterDependencies
): Router {
  const router = Router();
  router.use(json({ limit: "1mb" }));

  router.post("/auth/register", async (request, response) => {
    const username = stringValue(request.body?.username);
    const password = stringValue(request.body?.password);
    const result = await dependencies.authService.register(username, password);
    dependencies.authService.setCookie(response, result.token);
    response.status(201).json({ user: result.user });
  });

  router.post("/auth/login", async (request, response) => {
    const result = await dependencies.authService.login(
      stringValue(request.body?.username),
      stringValue(request.body?.password)
    );
    dependencies.authService.setCookie(response, result.token);
    response.json({ user: result.user });
  });

  router.post("/auth/logout", (request, response) => {
    dependencies.authService.logout(request, response);
    response.status(204).end();
  });

  router.get("/auth/me", (request, response) => {
    response.json({ user: dependencies.authService.requireUser(request) });
  });

  router.use((request, response, next) => {
    response.locals.user = dependencies.authService.requireUser(request);
    next();
  });

  router.get("/capabilities", (_request, response) => {
    response.json({
      creatableUnitTypes: CREATABLE_UNIT_TYPES,
      unavailableUnitTypes: [
        {
          type: UniverType.UNIVER_BOARD,
          reason: "Board data transformer is not exported by the current SDK",
        },
        {
          type: UniverType.UNIVER_BASE,
          reason: "Base data transformer is not exported by the current SDK",
        },
      ],
    });
  });

  router.get("/units", (request, response) => {
    const status = request.query.status === "deleted" ? "deleted" : "active";
    response.json({
      resources: dependencies.productStore.list(
        status,
        currentUser(response).userId
      ),
    });
  });

  router.get("/units/:resourceID", (request, response) => {
    const resource = dependencies.productStore.getByID(
      request.params.resourceID
    );
    if (!resource || resource.ownerUserId !== currentUser(response).userId) {
      throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
    }
    response.json({ resource });
  });

  router.post("/units", async (request, response) => {
    const type = request.body?.type as unknown;
    if (!isCreatableUnitType(type)) {
      throw new CollabError(
        "INVALID_REQUEST",
        "This Unit type is not currently creatable"
      );
    }
    const name = normalizeName(request.body?.name);
    const resourceID = randomUUID();
    const unitID = randomUUID();
    dependencies.productStore.createPending({
      id: resourceID,
      unitID,
      type,
      name,
      ownerUserId: currentUser(response).userId,
    });

    try {
      await dependencies.collabService.createUnitFromData(
        createInitialUnitData(type, unitID, name),
        {
          session: applicationSession(currentUser(response)),
          customData: { resourceID },
        }
      );
      const resource = dependencies.productStore.markActive(resourceID);
      response.status(201).json({ resource });
    } catch (error) {
      dependencies.productStore.markFailed(resourceID);
      throw error;
    }
  });

  router.delete("/units/:resourceID", (request, response) => {
    const existing = dependencies.productStore.getByID(request.params.resourceID);
    const resource =
      existing?.ownerUserId === currentUser(response).userId
        ? dependencies.productStore.softDelete(request.params.resourceID)
        : null;
    if (!resource) {
      throw new CollabError(
        "UNIT_NOT_FOUND",
        "Active resource does not exist"
      );
    }
    response.status(204).end();
  });

  router.post("/units/:resourceID/restore", (request, response) => {
    const existing = dependencies.productStore.getByID(request.params.resourceID);
    const resource =
      existing?.ownerUserId === currentUser(response).userId
        ? dependencies.productStore.restore(request.params.resourceID)
        : null;
    if (!resource) {
      throw new CollabError(
        "UNIT_NOT_FOUND",
        "Deleted resource does not exist"
      );
    }
    response.json({ resource });
  });

  return router;
}

export function createProtocolCompatibilityRouter(
  authService: AuthService
): Router {
  const router = Router();
  router.get("/user", (request, response) => {
    const user = authService.requireUser(request);
    response.json({
      error: OK_ERROR,
      user: protocolUser(user),
      wechat: undefined,
    });
  });
  router.post(
    "/authz/-/object/-/batch_allowed",
    json({ limit: "1mb" }),
    (request, response) => {
      const requests = request.body?.requests as unknown;
      if (!Array.isArray(requests)) {
        throw new CollabError(
          "INVALID_REQUEST",
          "requests must be an array"
        );
      }
      response.json({
        error: OK_ERROR,
        objectActions: requests.map((item: unknown) => {
          const candidate = item as {
            unitID?: unknown;
            objectID?: unknown;
            actions?: unknown;
          };
          return {
            unitID:
              typeof candidate.unitID === "string" ? candidate.unitID : "",
            objectID:
              typeof candidate.objectID === "string"
                ? candidate.objectID
                : "",
            actions: Array.isArray(candidate.actions)
              ? candidate.actions.map((action) => ({ action, allowed: true }))
              : [],
          };
        }),
      });
    }
  );
  return router;
}

function normalizeName(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : "Untitled";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function currentUser(response: {
  readonly locals: Record<string, unknown>;
}): DemoUser {
  return response.locals.user as DemoUser;
}

function applicationSession(user: DemoUser): CollabSession {
  return {
    memberId: `app-${randomUUID()}`,
    userId: user.userId,
    customData: { user },
  };
}
