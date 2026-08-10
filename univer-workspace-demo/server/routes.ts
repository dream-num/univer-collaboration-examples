import { randomUUID } from "node:crypto";
import type { UniverCollabService } from "@univerjs-pro/collaboration-service";
import {
  CollabError,
  MAX_UNIT_LIFECYCLE_BATCH_SIZE,
} from "@univerjs-pro/collaboration-service";
import { ErrorCode, UnitAction, UniverType } from "@univerjs/protocol";
import { json, Router } from "express";
import type { AuthService, UserStore } from "./auth.js";
import type { DemoUser } from "./demo-user.js";
import { protocolUser } from "./demo-user.js";
import { createWorkspaceLifecycleCustomData } from "./collaboration.js";
import type {
  ProductStore,
  ResourceAccessRole,
  ResourceMemberRole,
  SpaceAccessRole,
  SpaceMemberRole,
  WorkspaceFolder,
  WorkspaceNode,
  WorkspaceResource,
  WorkspaceSpace,
} from "./product-store.js";
import {
  CREATABLE_UNIT_TYPES,
  createInitialUnit,
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
  const lifecycleCoordinator = new ApplicationLifecycleCoordinator();
  router.use(json({ limit: "1mb" }));

  router.post("/auth/register", async (request, response) => {
    const result = await dependencies.authService.register(
      stringValue(request.body?.username),
      stringValue(request.body?.password)
    );
    dependencies.productStore.ensurePersonalSpace(
      result.user.userId,
      result.user.name
    );
    dependencies.authService.setCookie(response, result.token);
    response.status(201).json({ user: result.user });
  });

  router.post("/auth/login", async (request, response) => {
    const result = await dependencies.authService.login(
      stringValue(request.body?.username),
      stringValue(request.body?.password)
    );
    dependencies.productStore.ensurePersonalSpace(
      result.user.userId,
      result.user.name
    );
    dependencies.authService.setCookie(response, result.token);
    response.json({ user: result.user });
  });

  router.post("/auth/logout", (request, response) => {
    dependencies.authService.logout(request, response);
    response.status(204).end();
  });

  router.get("/auth/me", (request, response) => {
    const user = dependencies.authService.requireUser(request);
    dependencies.productStore.ensurePersonalSpace(user.userId, user.name);
    response.json({ user });
  });

  router.use((request, response, next) => {
    const user = dependencies.authService.requireUser(request);
    dependencies.productStore.ensurePersonalSpace(user.userId, user.name);
    response.locals.user = user;
    next();
  });

  router.get("/capabilities", (_request, response) => {
    response.json({
      creatableUnitTypes: CREATABLE_UNIT_TYPES,
      unavailableUnitTypes: [],
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

  router.get("/spaces", (_request, response) => {
    const user = currentUser(response);
    response.json({
      spaces: dependencies.productStore
        .listSpaces(user.userId)
        .map(({ space, role }) =>
          spaceResponse(space, role, dependencies.userStore)
        ),
    });
  });

  router.post("/spaces", (request, response) => {
    const user = currentUser(response);
    const space = dependencies.productStore.createTeam({
      id: randomUUID(),
      name: requiredName(request.body?.name, "团队空间名称不能为空"),
      ownerUserId: user.userId,
    });
    response
      .status(201)
      .json({ space: spaceResponse(space, "owner", dependencies.userStore) });
  });

  router.get("/spaces/:spaceID/nodes", (request, response) => {
    const user = currentUser(response);
    const { space, role } = requireBrowsableSpace(
      dependencies.productStore,
      request.params.spaceID,
      user.userId
    );
    const parentID = optionalID(request.query.parentID);
    const breadcrumbs = dependencies.productStore.getBreadcrumbs(
      space.id,
      parentID
    );
    response.json({
      space: spaceResponse(space, role, dependencies.userStore),
      breadcrumbs: breadcrumbs.map(folderResponse),
      nodes: dependencies.productStore
        .listChildren(space.id, parentID)
        .map((node) =>
          nodeResponse(node, role, dependencies.userStore)
        ),
    });
  });

  router.get("/spaces/:spaceID/trash", (request, response) => {
    const user = currentUser(response);
    const { space, role } = requireBrowsableSpace(
      dependencies.productStore,
      request.params.spaceID,
      user.userId
    );
    if (!canDelete(role, space.type)) {
      throw new CollabError("PERMISSION_DENIED", "无权管理此空间的回收站");
    }
    response.json({
      space: spaceResponse(space, role, dependencies.userStore),
      nodes: dependencies.productStore
        .listTrash(space.id)
        .map((node) => nodeResponse(node, role, dependencies.userStore)),
    });
  });

  router.post("/spaces/:spaceID/folders", (request, response) => {
    const user = currentUser(response);
    const { space, role } = requireBrowsableSpace(
      dependencies.productStore,
      request.params.spaceID,
      user.userId
    );
    requireContentEditor(role, space.type);
    const folder = dependencies.productStore.createFolder({
      id: randomUUID(),
      spaceID: space.id,
      parentID: optionalID(request.body?.parentID),
      name: requiredName(request.body?.name, "文件夹名称不能为空"),
      createdBy: user.userId,
    });
    response.status(201).json({ folder: folderResponse(folder) });
  });

  router.patch("/folders/:folderID", (request, response) => {
    const user = currentUser(response);
    const folder = requireActiveFolder(
      dependencies.productStore,
      request.params.folderID
    );
    const space = dependencies.productStore.getSpace(folder.spaceID)!;
    const role = dependencies.productStore.getSpaceRole(space.id, user.userId);
    requireContentEditor(role, space.type);
    const renamed = dependencies.productStore.renameFolder(
      folder.id,
      requiredName(request.body?.name, "文件夹名称不能为空")
    );
    response.json({ folder: folderResponse(renamed!) });
  });

  router.delete("/nodes/:nodeID", async (request, response) => {
    const user = currentUser(response);
    const node = requireExistingNode(
      dependencies.productStore,
      request.params.nodeID
    );
    const space = dependencies.productStore.getSpace(node.spaceID)!;
    const role = dependencies.productStore.getSpaceRole(space.id, user.userId);
    if (!role || !canDelete(role, space.type)) {
      throw new CollabError("PERMISSION_DENIED", "无权删除此内容");
    }
    await lifecycleCoordinator.runExclusive(() =>
      softDeleteNode(dependencies, node.id, user)
    );
    response.status(204).end();
  });

  router.post("/nodes/:nodeID/restore", async (request, response) => {
    const user = currentUser(response);
    const node = requireExistingNode(
      dependencies.productStore,
      request.params.nodeID
    );
    const space = dependencies.productStore.getSpace(node.spaceID)!;
    const role = dependencies.productStore.getSpaceRole(space.id, user.userId);
    if (!role || !canDelete(role, space.type)) {
      throw new CollabError("PERMISSION_DENIED", "无权恢复此内容");
    }
    await lifecycleCoordinator.runExclusive(() =>
      restoreNode(dependencies, node.id, user)
    );
    response.status(204).end();
  });

  router.get("/spaces/:spaceID/members", (request, response) => {
    const user = currentUser(response);
    const { space, role } = requireTeamSpace(
      dependencies.productStore,
      request.params.spaceID,
      user.userId
    );
    response.json({
      space: spaceResponse(space, role, dependencies.userStore),
      members: teamMembers(space, dependencies.productStore, dependencies.userStore),
    });
  });

  router.post("/spaces/:spaceID/members", (request, response) => {
    const actor = currentUser(response);
    const { space, role: actorRole } = requireTeamSpace(
      dependencies.productStore,
      request.params.spaceID,
      actor.userId
    );
    requireMemberManager(actorRole);
    const target = dependencies.userStore.getById(
      stringValue(request.body?.userId)
    );
    const role = teamMemberRole(request.body?.role);
    if (!target || target.userId === space.ownerUserId) {
      throw new CollabError("INVALID_REQUEST", "无法添加该用户");
    }
    assertAssignableRole(actorRole, role);
    dependencies.productStore.setSpaceMember({
      spaceID: space.id,
      userId: target.userId,
      role,
      invitedBy: actor.userId,
    });
    response.status(201).json({ member: { user: target, role } });
  });

  router.patch(
    "/spaces/:spaceID/members/:userID",
    (request, response) => {
      const actor = currentUser(response);
      const { space, role: actorRole } = requireTeamSpace(
        dependencies.productStore,
        request.params.spaceID,
        actor.userId
      );
      requireMemberManager(actorRole);
      const existing = dependencies.productStore.getSpaceMember(
        space.id,
        request.params.userID
      );
      if (!existing) {
        throw new CollabError("UNIT_NOT_FOUND", "团队成员不存在");
      }
      if (actorRole === "admin" && existing.role === "admin") {
        throw new CollabError(
          "PERMISSION_DENIED",
          "管理员不能修改其他管理员"
        );
      }
      const role = teamMemberRole(request.body?.role);
      assertAssignableRole(actorRole, role);
      const target = dependencies.userStore.getById(existing.userId)!;
      dependencies.productStore.setSpaceMember({
        spaceID: space.id,
        userId: target.userId,
        role,
        invitedBy: actor.userId,
      });
      response.json({ member: { user: target, role } });
    }
  );

  router.delete(
    "/spaces/:spaceID/members/:userID",
    (request, response) => {
      const actor = currentUser(response);
      const { space, role: actorRole } = requireTeamSpace(
        dependencies.productStore,
        request.params.spaceID,
        actor.userId
      );
      requireMemberManager(actorRole);
      const existing = dependencies.productStore.getSpaceMember(
        space.id,
        request.params.userID
      );
      if (!existing) {
        throw new CollabError("UNIT_NOT_FOUND", "团队成员不存在");
      }
      if (actorRole === "admin" && existing.role === "admin") {
        throw new CollabError(
          "PERMISSION_DENIED",
          "管理员不能移除其他管理员"
        );
      }
      dependencies.productStore.removeSpaceMember(space.id, existing.userId);
      response.status(204).end();
    }
  );

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
    throw new CollabError(
      "INVALID_REQUEST",
      "Units must be listed through a space directory"
    );
  });

  router.get("/units/:resourceID", (request, response) => {
    const { resource, role } = requireReadableActiveResource(
      dependencies.productStore,
      request.params.resourceID,
      currentUser(response).userId
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
    const { resource } = requireEditableActiveResource(
      dependencies.productStore,
      request.params.resourceID,
      user.userId
    );
    const name = requiredName(request.body?.name, "名称不能为空");
    if (
      resource.type === UniverType.UNIVER_BOARD ||
      resource.type === UniverType.UNIVER_BASE
    ) {
      const renamed = dependencies.productStore.renameByUnitID(
        resource.unitID,
        name
      );
      if (!renamed) {
        throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
      }
      response.json({
        resource: resourceResponse(
          renamed,
          dependencies.productStore.getAccessRoleByID(
            renamed.id,
            user.userId
          )!,
          dependencies.userStore
        ),
      });
      return;
    }
    const context = {
      userID: user.userId,
      memberID: `app-${randomUUID()}`,
      customData: { user },
    };
    const current = await dependencies.collabService.getUnit(
      {
        unitID: resource.unitID,
        type: resource.type,
        revision: 0,
      },
      context
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
          memberID: context.memberID,
          mutations: [
            {
              id: renameMutationID(resource.type),
              data: JSON.stringify({ unitId: resource.unitID, name }),
            },
          ],
        },
      },
      context
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
    const user = currentUser(response);
    const type = request.body?.type as unknown;
    if (!isCreatableUnitType(type)) {
      throw new CollabError(
        "INVALID_REQUEST",
        "This Unit type is not currently creatable"
      );
    }
    const { space, role } = requireBrowsableSpace(
      dependencies.productStore,
      stringValue(request.body?.spaceID),
      user.userId
    );
    requireContentEditor(role, space.type);
    const resourceID = randomUUID();
    const unitID = randomUUID();
    dependencies.productStore.createPending({
      id: resourceID,
      unitID,
      type,
      name: optionalName(request.body?.name),
      spaceID: space.id,
      parentID: optionalID(request.body?.parentID),
      createdBy: user.userId,
    });

    try {
      const initial = createInitialUnit(
        type,
        unitID,
        optionalName(request.body?.name)
      );
      const options = {
        userID: user.userId,
        customData: { resourceID },
      };
      await dependencies.collabService.createUnitFromData(initial, options);
      const resource = dependencies.productStore.markActive(resourceID);
      response.status(201).json({
        resource: resourceResponse(
          resource,
          dependencies.productStore.getAccessRoleByID(
            resource.id,
            user.userId
          )!,
          dependencies.userStore
        ),
      });
    } catch (error) {
      dependencies.productStore.markFailed(resourceID);
      throw error;
    }
  });

  router.delete("/units/:resourceID", async (request, response) => {
    const user = currentUser(response);
    const resource = dependencies.productStore.getByID(
      request.params.resourceID
    );
    if (!resource) {
      throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
    }
    const role = dependencies.productStore.getAccessRoleByID(
      resource.id,
      user.userId
    );
    if (!role || !canDelete(role, resource.spaceType)) {
      throw new CollabError("PERMISSION_DENIED", "无权删除此内容");
    }
    await lifecycleCoordinator.runExclusive(() =>
      softDeleteNode(dependencies, resource.id, user)
    );
    response.status(204).end();
  });

  router.post("/units/:resourceID/restore", async (request, response) => {
    const user = currentUser(response);
    const resource = dependencies.productStore.getByID(
      request.params.resourceID
    );
    if (!resource) {
      throw new CollabError("UNIT_NOT_FOUND", "Deleted resource does not exist");
    }
    const role = dependencies.productStore.getSpaceRole(
      resource.spaceID,
      user.userId
    );
    if (!role || !canDelete(role, resource.spaceType)) {
      throw new CollabError("PERMISSION_DENIED", "无权恢复此内容");
    }
    await lifecycleCoordinator.runExclusive(() =>
      restoreNode(dependencies, resource.id, user)
    );
    response.json({
      resource: resourceResponse(
        dependencies.productStore.getByID(resource.id)!,
        role,
        dependencies.userStore
      ),
    });
  });

  router.get("/units/:resourceID/members", (request, response) => {
    const resource = requireOwnedPersonalResource(
      dependencies.productStore,
      request.params.resourceID,
      currentUser(response).userId
    );
    const owner = dependencies.userStore.getById(resource.ownerUserId);
    response.json({
      members: [
        ...(owner ? [{ user: owner, role: "owner" as const }] : []),
        ...dependencies.productStore
          .listResourceMembers(resource.id)
          .flatMap((member) => {
            const user = dependencies.userStore.getById(member.userId);
            return user ? [{ user, role: member.role }] : [];
          }),
      ],
    });
  });

  router.post("/units/:resourceID/members", (request, response) => {
    const owner = currentUser(response);
    const resource = requireOwnedPersonalResource(
      dependencies.productStore,
      request.params.resourceID,
      owner.userId
    );
    const target = dependencies.userStore.getById(
      stringValue(request.body?.userId)
    );
    const role = resourceMemberRole(request.body?.role);
    if (!target || target.userId === resource.ownerUserId) {
      throw new CollabError("INVALID_REQUEST", "无法添加该用户");
    }
    dependencies.productStore.setResourceMember({
      resourceID: resource.id,
      userId: target.userId,
      role,
      invitedBy: owner.userId,
    });
    response.status(201).json({ member: { user: target, role } });
  });

  router.patch(
    "/units/:resourceID/members/:userID",
    (request, response) => {
      const owner = currentUser(response);
      const resource = requireOwnedPersonalResource(
        dependencies.productStore,
        request.params.resourceID,
        owner.userId
      );
      const target = dependencies.userStore.getById(request.params.userID);
      if (
        !target ||
        !dependencies.productStore.getResourceMember(
          resource.id,
          target.userId
        )
      ) {
        throw new CollabError("UNIT_NOT_FOUND", "成员不存在");
      }
      const role = resourceMemberRole(request.body?.role);
      dependencies.productStore.setResourceMember({
        resourceID: resource.id,
        userId: target.userId,
        role,
        invitedBy: owner.userId,
      });
      response.json({ member: { user: target, role } });
    }
  );

  router.delete(
    "/units/:resourceID/members/:userID",
    (request, response) => {
      const resource = requireOwnedPersonalResource(
        dependencies.productStore,
        request.params.resourceID,
        currentUser(response).userId
      );
      if (
        !dependencies.productStore.removeResourceMember(
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
        throw new CollabError("INVALID_REQUEST", "requests must be an array");
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

function optionalName(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 120)
    : "Untitled";
}

function requiredName(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new CollabError("INVALID_REQUEST", message);
  }
  return value.trim().slice(0, 120);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalID(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function teamMemberRole(value: unknown): SpaceMemberRole {
  if (value === "admin" || value === "editor" || value === "viewer") {
    return value;
  }
  throw new CollabError("INVALID_REQUEST", "团队成员权限无效");
}

function resourceMemberRole(value: unknown): ResourceMemberRole {
  if (value === "editor" || value === "viewer") return value;
  throw new CollabError("INVALID_REQUEST", "成员权限无效");
}

function currentUser(response: {
  readonly locals: Record<string, unknown>;
}): DemoUser {
  return response.locals.user as DemoUser;
}

async function softDeleteNode(
  dependencies: ApplicationRouterDependencies,
  nodeID: string,
  user: DemoUser
): Promise<void> {
  const node = requireExistingNode(dependencies.productStore, nodeID);
  requireLifecycleRootManager(
    dependencies.productStore,
    node,
    user.userId,
    "删除"
  );
  if (node.status !== "active") {
    throw new CollabError("UNIT_NOT_FOUND", "内容不存在");
  }
  const unitIDs = dependencies.productStore.listSubtreeUnitIDs(node.id);
  assertLifecycleBatchSize(unitIDs);
  const options = lifecycleCallOptions(user);
  if (unitIDs.length > 0) {
    await dependencies.collabService.deleteUnits(
      { unitIDs, hardDelete: false },
      options
    );
  }
  try {
    if (!dependencies.productStore.softDeleteNode(node.id)) {
      throw new CollabError("UNIT_NOT_FOUND", "内容不存在");
    }
  } catch (error) {
    if (unitIDs.length > 0) {
      await bestEffort(() =>
        dependencies.collabService.recoverUnits({ unitIDs }, options)
      );
    }
    throw error;
  }
}

async function restoreNode(
  dependencies: ApplicationRouterDependencies,
  nodeID: string,
  user: DemoUser
): Promise<void> {
  const node = requireExistingNode(dependencies.productStore, nodeID);
  requireLifecycleRootManager(
    dependencies.productStore,
    node,
    user.userId,
    "恢复"
  );
  if (node.status !== "deleted") {
    throw new CollabError("INVALID_REQUEST", "内容不在回收站中");
  }
  if (node.parentID) {
    const parent = dependencies.productStore.getFolder(node.parentID);
    if (!parent || parent.status !== "active") {
      throw new CollabError("INVALID_REQUEST", "请先恢复上级文件夹");
    }
  }
  const unitIDs = dependencies.productStore.listSubtreeUnitIDs(node.id);
  assertLifecycleBatchSize(unitIDs);
  const options = lifecycleCallOptions(user);
  if (unitIDs.length > 0) {
    await dependencies.collabService.recoverUnits({ unitIDs }, options);
  }
  try {
    if (!dependencies.productStore.restoreNode(node.id)) {
      throw new CollabError("INVALID_REQUEST", "请先恢复上级文件夹");
    }
  } catch (error) {
    if (unitIDs.length > 0) {
      await bestEffort(() =>
        dependencies.collabService.deleteUnits(
          { unitIDs, hardDelete: false },
          options
        )
      );
    }
    throw error;
  }
}

function lifecycleCallOptions(user: DemoUser) {
  return {
    userID: user.userId,
    customData: createWorkspaceLifecycleCustomData(),
  };
}

function assertLifecycleBatchSize(unitIDs: readonly string[]): void {
  if (unitIDs.length > MAX_UNIT_LIFECYCLE_BATCH_SIZE) {
    throw new CollabError(
      "INVALID_REQUEST",
      `子树包含 ${unitIDs.length} 个 Unit，超过单次生命周期操作上限 ${MAX_UNIT_LIFECYCLE_BATCH_SIZE}`
    );
  }
}

async function bestEffort(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch {
    // Preserve the failure from the second store operation.
  }
}

class ApplicationLifecycleCoordinator {
  private _tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this._tail;
    let release!: () => void;
    this._tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function requireLifecycleRootManager(
  productStore: ProductStore,
  node: WorkspaceNode,
  userId: string,
  operation: "删除" | "恢复"
): void {
  const space = productStore.getSpace(node.spaceID);
  const role =
    node.kind === "folder"
      ? productStore.getSpaceRole(node.spaceID, userId)
      : productStore.getAccessRoleByID(node.id, userId);
  if (!space || !role || !canDelete(role, space.type)) {
    throw new CollabError("PERMISSION_DENIED", `无权${operation}此内容`);
  }
}

function requireBrowsableSpace(
  productStore: ProductStore,
  spaceID: string,
  userId: string
): { space: WorkspaceSpace; role: SpaceAccessRole } {
  const space = productStore.getSpace(spaceID);
  const role = space ? productStore.getSpaceRole(space.id, userId) : null;
  if (!space || !role || (space.type === "personal" && role !== "owner")) {
    throw new CollabError("UNIT_NOT_FOUND", "Space does not exist");
  }
  return { space, role };
}

function requireTeamSpace(
  productStore: ProductStore,
  spaceID: string,
  userId: string
): { space: WorkspaceSpace; role: SpaceAccessRole } {
  const access = requireBrowsableSpace(productStore, spaceID, userId);
  if (access.space.type !== "team") {
    throw new CollabError("UNIT_NOT_FOUND", "Team space does not exist");
  }
  return access;
}

function requireContentEditor(
  role: SpaceAccessRole | null,
  spaceType: WorkspaceSpace["type"]
): void {
  const allowed =
    role === "owner" ||
    (spaceType === "team" && (role === "admin" || role === "editor"));
  if (!allowed) {
    throw new CollabError("PERMISSION_DENIED", "此空间为只读");
  }
}

function canDelete(
  role: ResourceAccessRole,
  spaceType: WorkspaceSpace["type"]
): boolean {
  return role === "owner" || (spaceType === "team" && role === "admin");
}

function requireMemberManager(role: SpaceAccessRole): void {
  if (role !== "owner" && role !== "admin") {
    throw new CollabError("PERMISSION_DENIED", "无权管理团队成员");
  }
}

function assertAssignableRole(
  actorRole: SpaceAccessRole,
  targetRole: SpaceMemberRole
): void {
  if (actorRole === "admin" && targetRole === "admin") {
    throw new CollabError("PERMISSION_DENIED", "只有所有者可以设置管理员");
  }
}

function requireActiveFolder(
  productStore: ProductStore,
  folderID: string
): WorkspaceFolder {
  const folder = productStore.getFolder(folderID);
  if (!folder || folder.status !== "active") {
    throw new CollabError("UNIT_NOT_FOUND", "文件夹不存在");
  }
  return folder;
}

function requireExistingNode(
  productStore: ProductStore,
  nodeID: string
): WorkspaceNode {
  const node = productStore.getFolder(nodeID) ?? productStore.getByID(nodeID);
  if (!node) throw new CollabError("UNIT_NOT_FOUND", "内容不存在");
  return node;
}

function requireEditableActiveResource(
  productStore: ProductStore,
  resourceID: string,
  userId: string
): { resource: WorkspaceResource; role: ResourceAccessRole } {
  const access = requireReadableActiveResource(
    productStore,
    resourceID,
    userId
  );
  if (access.role === "viewer") {
    throw new CollabError("PERMISSION_DENIED", "Resource is read-only");
  }
  return access;
}

function requireReadableActiveResource(
  productStore: ProductStore,
  resourceID: string,
  userId: string
): { resource: WorkspaceResource; role: ResourceAccessRole } {
  const resource = productStore.getByID(resourceID);
  const role = resource
    ? productStore.getAccessRoleByID(resource.id, userId)
    : null;
  if (!resource || resource.status !== "active" || !role) {
    throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
  }
  return { resource, role };
}

function requireOwnedPersonalResource(
  productStore: ProductStore,
  resourceID: string,
  userId: string
): WorkspaceResource {
  const resource = productStore.getByID(resourceID);
  if (
    !resource ||
    resource.status !== "active" ||
    resource.spaceType !== "personal" ||
    resource.ownerUserId !== userId
  ) {
    throw new CollabError("UNIT_NOT_FOUND", "Resource does not exist");
  }
  return resource;
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

function spaceResponse(
  space: WorkspaceSpace,
  accessRole: SpaceAccessRole,
  userStore: UserStore
) {
  const owner = userStore.getById(space.ownerUserId);
  return {
    id: space.id,
    type: space.type,
    name: space.name,
    accessRole,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt,
    owner: owner ?? {
      userId: space.ownerUserId,
      username: "",
      name: "Unknown",
    },
  };
}

function folderResponse(folder: WorkspaceFolder) {
  return {
    kind: "folder" as const,
    id: folder.id,
    spaceID: folder.spaceID,
    parentID: folder.parentID,
    name: folder.name,
    status: folder.status,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

function nodeResponse(
  node: WorkspaceNode,
  role: SpaceAccessRole,
  userStore: UserStore
) {
  return node.kind === "folder"
    ? { ...folderResponse(node), accessRole: role }
    : resourceResponse(node, role, userStore);
}

function resourceResponse(
  resource: WorkspaceResource,
  accessRole: ResourceAccessRole,
  userStore: UserStore,
  lastOpenedAt?: number
) {
  const owner = userStore.getById(resource.ownerUserId);
  return {
    kind: "unit" as const,
    id: resource.id,
    spaceID: resource.spaceID,
    parentID: resource.parentID,
    unitID: resource.unitID,
    type: resource.type,
    name: resource.name,
    status: resource.status,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt,
    ...(lastOpenedAt === undefined ? {} : { lastOpenedAt }),
    accessRole,
    space: {
      id: resource.spaceID,
      type: resource.spaceType,
      name: resource.spaceName,
    },
    owner: owner ?? {
      userId: resource.ownerUserId,
      username: "",
      name: "Unknown",
    },
  };
}

function teamMembers(
  space: WorkspaceSpace,
  productStore: ProductStore,
  userStore: UserStore
) {
  const owner = userStore.getById(space.ownerUserId);
  return [
    ...(owner ? [{ user: owner, role: "owner" as const }] : []),
    ...productStore.listSpaceMembers(space.id).flatMap((member) => {
      const user = userStore.getById(member.userId);
      return user ? [{ user, role: member.role }] : [];
    }),
  ];
}

function isUnitActionAllowed(
  role: ResourceAccessRole | null,
  action: unknown
): boolean {
  if (!role || typeof action !== "number") return false;
  if (action === UnitAction.Share) return false;
  if (role === "owner" || role === "admin") return true;
  if (role === "editor") {
    return ![
      UnitAction.ManageCollaborator,
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
