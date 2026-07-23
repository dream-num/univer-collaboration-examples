import { randomUUID } from "node:crypto";
import type {
  CollabSession,
  UniverCollabService,
} from "@univerjs/collaboration-service";
import { CollabError } from "@univerjs/collaboration-service";
import { ErrorCode, UnitAction, UniverType } from "@univerjs/protocol";
import { json, Router } from "express";
import type { AuthService, UserStore } from "./auth.js";
import type { DemoUser } from "./demo-user.js";
import { protocolUser } from "./demo-user.js";
import type {
  ProductStore,
  ResourceAccessRole,
  ResourceMemberRole,
  SuiteResource,
} from "./product-store.js";
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
  readonly userStore: UserStore;
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

  router.get("/users", (request, response) => {
    const user = currentUser(response);
    response.json({
      users: dependencies.userStore
        .search(stringValue(request.query.query))
        .filter(({ userId }) => userId !== user.userId),
    });
  });

  router.get("/units", (request, response) => {
    const user = currentUser(response);
    if (request.query.scope === "recent") {
      response.json({
        resources: dependencies.productStore
          .listRecent(user.userId)
          .map(({ resource, role, lastOpenedAt }) =>
            resourceResponse(
              resource,
              role,
              dependencies.userStore,
              lastOpenedAt
            )
          ),
      });
      return;
    }
    if (request.query.scope === "shared") {
      response.json({
        resources: dependencies.productStore
          .listShared(user.userId)
          .map(({ resource, role }) =>
            resourceResponse(resource, role, dependencies.userStore)
          ),
      });
      return;
    }

    const status = request.query.status === "deleted" ? "deleted" : "active";
    response.json({
      resources: dependencies.productStore
        .list(status, user.userId)
        .map((resource) =>
          resourceResponse(resource, "owner", dependencies.userStore)
        ),
    });
  });

  router.get("/units/:resourceID", (request, response) => {
    const user = currentUser(response);
    const { resource, role } = requireReadableActiveResource(
      dependencies.productStore,
      request.params.resourceID,
      user.userId
    );
    response.json({
      resource: resourceResponse(resource, role, dependencies.userStore),
    });
  });

  router.post("/units/:resourceID/open", (request, response) => {
    const user = currentUser(response);
    const { resource, role } = requireReadableActiveResource(
      dependencies.productStore,
      request.params.resourceID,
      user.userId
    );
    const lastOpenedAt = dependencies.productStore.markOpened(
      resource.id,
      user.userId
    );
    response.json({
      resource: resourceResponse(
        resource,
        role,
        dependencies.userStore,
        lastOpenedAt
      ),
    });
  });

  router.patch("/units/:resourceID", async (request, response) => {
    const user = currentUser(response);
    const resource = requireEditableActiveResource(
      dependencies.productStore,
      request.params.resourceID,
      user.userId
    );
    const name = renameName(request.body?.name);
    const session = applicationSession(user);
    const current = await dependencies.collabService.getUnit(
      {
        unitID: resource.unitID,
        type: resource.type,
        revision: 0,
      },
      { session }
    );
    const result = await dependencies.collabService.submitChangeset(
      {
        changeset: {
          unitID: resource.unitID,
          type: resource.type,
          baseRev: current.headRevision,
          revision: current.headRevision + 1,
          sid: randomUUID(),
          reqId: 1,
          userID: user.userId,
          memberID: session.memberId,
          mutations: [
            {
              id: renameMutationID(resource.type),
              data: JSON.stringify({ unitId: resource.unitID, name }),
            },
          ],
        },
      },
      { session }
    );
    if (result.status === "rejected" || result.status === "retry") {
      throw result.error;
    }
    const renamed =
      dependencies.productStore.getByID(resource.id)?.name === name
        ? dependencies.productStore.getByID(resource.id)!
        : dependencies.productStore.renameByUnitID(resource.unitID, name);
    if (!renamed) {
      throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
    }
    response.json({
      resource: resourceResponse(
        renamed,
        dependencies.productStore.getAccessRoleByID(renamed.id, user.userId)!,
        dependencies.userStore
      ),
    });
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
      response.status(201).json({
        resource: resourceResponse(
          resource,
          "owner",
          dependencies.userStore
        ),
      });
    } catch (error) {
      dependencies.productStore.markFailed(resourceID);
      throw error;
    }
  });

  router.delete("/units/:resourceID", (request, response) => {
    const existing = dependencies.productStore.getByID(
      request.params.resourceID
    );
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
    const existing = dependencies.productStore.getByID(
      request.params.resourceID
    );
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
    response.json({
      resource: resourceResponse(resource, "owner", dependencies.userStore),
    });
  });

  router.get("/units/:resourceID/members", (request, response) => {
    const resource = requireOwnedActiveResource(
      dependencies.productStore,
      request.params.resourceID,
      currentUser(response).userId
    );
    const owner = dependencies.userStore.getById(resource.ownerUserId);
    response.json({
      members: [
        ...(owner ? [{ user: owner, role: "owner" as const }] : []),
        ...dependencies.productStore.listMembers(resource.id).flatMap((member) => {
          const user = dependencies.userStore.getById(member.userId);
          return user ? [{ user, role: member.role }] : [];
        }),
      ],
    });
  });

  router.post("/units/:resourceID/members", (request, response) => {
    const owner = currentUser(response);
    const resource = requireOwnedActiveResource(
      dependencies.productStore,
      request.params.resourceID,
      owner.userId
    );
    const targetUserId = stringValue(request.body?.userId);
    const role = memberRole(request.body?.role);
    const target = dependencies.userStore.getById(targetUserId);
    if (!target || target.userId === resource.ownerUserId) {
      throw new CollabError("INVALID_REQUEST", "无法添加该用户");
    }
    dependencies.productStore.setMember({
      resourceID: resource.id,
      userId: target.userId,
      role,
      createdBy: owner.userId,
    });
    response.status(201).json({ member: { user: target, role } });
  });

  router.patch(
    "/units/:resourceID/members/:userID",
    (request, response) => {
      const owner = currentUser(response);
      const resource = requireOwnedActiveResource(
        dependencies.productStore,
        request.params.resourceID,
        owner.userId
      );
      const target = dependencies.userStore.getById(request.params.userID);
      if (
        !target ||
        !dependencies.productStore.getMember(resource.id, target.userId)
      ) {
        throw new CollabError("UNIT_NOT_FOUND", "成员不存在");
      }
      const role = memberRole(request.body?.role);
      dependencies.productStore.setMember({
        resourceID: resource.id,
        userId: target.userId,
        role,
        createdBy: owner.userId,
      });
      response.json({ member: { user: target, role } });
    }
  );

  router.delete(
    "/units/:resourceID/members/:userID",
    (request, response) => {
      const resource = requireOwnedActiveResource(
        dependencies.productStore,
        request.params.resourceID,
        currentUser(response).userId
      );
      if (
        !dependencies.productStore.removeMember(
          resource.id,
          request.params.userID
        )
      ) {
        throw new CollabError("UNIT_NOT_FOUND", "成员不存在");
      }
      response.status(204).end();
    }
  );

  return router;
}

export function createProtocolCompatibilityRouter(dependencies: {
  readonly authService: AuthService;
  readonly productStore: ProductStore;
}): Router {
  const router = Router();
  router.get("/user", (request, response) => {
    const user = dependencies.authService.requireUser(request);
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
      const user = dependencies.authService.requireUser(request);
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
          const unitID =
            typeof candidate.unitID === "string" ? candidate.unitID : "";
          const resource = unitID
            ? dependencies.productStore.getByUnitID(unitID)
            : null;
          const role =
            resource?.status === "active"
              ? dependencies.productStore.getAccessRoleByID(
                  resource.id,
                  user.userId
                )
              : null;
          return {
            unitID,
            objectID:
              typeof candidate.objectID === "string"
                ? candidate.objectID
                : "",
            actions: Array.isArray(candidate.actions)
              ? candidate.actions.map((action) => ({
                  action,
                  allowed: isUnitActionAllowed(role, action),
                }))
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

function renameName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CollabError("INVALID_REQUEST", "名称不能为空");
  }
  return value.trim().slice(0, 120);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function memberRole(value: unknown): ResourceMemberRole {
  if (value === "editor" || value === "viewer") return value;
  throw new CollabError("INVALID_REQUEST", "成员权限无效");
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

function requireOwnedActiveResource(
  productStore: ProductStore,
  resourceID: string,
  userId: string
): SuiteResource {
  const resource = productStore.getByID(resourceID);
  if (
    !resource ||
    resource.status !== "active" ||
    resource.ownerUserId !== userId
  ) {
    throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
  }
  return resource;
}

function requireEditableActiveResource(
  productStore: ProductStore,
  resourceID: string,
  userId: string
): SuiteResource {
  const resource = productStore.getByID(resourceID);
  const role = resource
    ? productStore.getAccessRoleByID(resource.id, userId)
    : null;
  if (!resource || resource.status !== "active" || !role) {
    throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
  }
  if (role === "viewer") {
    throw new CollabError("PERMISSION_DENIED", "Resource is read-only");
  }
  return resource;
}

function requireReadableActiveResource(
  productStore: ProductStore,
  resourceID: string,
  userId: string
): { resource: SuiteResource; role: ResourceAccessRole } {
  const resource = productStore.getByID(resourceID);
  const role = resource
    ? productStore.getAccessRoleByID(resource.id, userId)
    : null;
  if (!resource || resource.status !== "active" || !role) {
    throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
  }
  return { resource, role };
}

function renameMutationID(type: UniverType): string {
  switch (type) {
    case UniverType.UNIVER_SHEET:
      return "sheet.mutation.set-workbook-name";
    case UniverType.UNIVER_DOC:
      return "doc.mutation.rename-doc";
    case UniverType.UNIVER_SLIDE:
      return "slide.mutation.set-name";
    default:
      throw new CollabError(
        "INVALID_REQUEST",
        "This Unit type cannot be renamed"
      );
  }
}

function resourceResponse(
  resource: SuiteResource,
  accessRole: ResourceAccessRole,
  userStore: UserStore,
  lastOpenedAt?: number
) {
  const owner = userStore.getById(resource.ownerUserId);
  return {
    id: resource.id,
    unitID: resource.unitID,
    type: resource.type,
    name: resource.name,
    status: resource.status,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    ...(lastOpenedAt === undefined ? {} : { lastOpenedAt }),
    accessRole,
    owner: owner
      ? {
          userId: owner.userId,
          username: owner.username,
          name: owner.name,
        }
      : {
          userId: resource.ownerUserId,
          username: "",
          name: "Unknown",
        },
  };
}

function isUnitActionAllowed(
  role: ResourceAccessRole | null,
  action: unknown
): boolean {
  if (!role || typeof action !== "number") return false;
  if (role === "owner") return true;
  if (role === "editor") {
    return ![
      UnitAction.ManageCollaborator,
      UnitAction.Share,
      UnitAction.Delete,
    ].includes(action);
  }
  return [
    UnitAction.View,
    UnitAction.Print,
    UnitAction.Copy,
    UnitAction.Export,
    UnitAction.IHistory,
    UnitAction.ViemRwHgtClWdt,
    UnitAction.ViewFilter,
    UnitAction.SelectProtectedCells,
    UnitAction.SelectUnProtectedCells,
    UnitAction.ViewHistory,
  ].includes(action);
}
