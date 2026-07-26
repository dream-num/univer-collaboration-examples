import type { Server } from "node:http";
import {
  MemorySessionTicketStore,
  UniverCollabEndpoint,
} from "@univerjs/collaboration-endpoint";
import {
  DefaultHistoryPolicy,
  UniverHistoryService,
  type IHistoryDatabaseAdapter,
} from "@univerjs/collaboration-history-service";
import { UniverHistoryEndpoint } from "@univerjs/collaboration-history-endpoint";
import {
  CollabError,
  UniverCollabService,
  type IDatabaseAdapter,
} from "@univerjs/collaboration-service";
import { createNodeTransport } from "@univerjs/collaboration-transport-node";
import type { IWorktreeDatabaseAdapter } from "@univerjs/collaboration-worktree-service";
import { UniverCollabWorktreeService } from "@univerjs/collaboration-worktree-service";
import { UniverCollabWorktreeEndpoint } from "@univerjs/collaboration-worktree-endpoint";
import type { RequestHandler } from "express";
import type { AuthService } from "./auth.js";
import type { DemoUser } from "./demo-user.js";
import { protocolUser } from "./demo-user.js";
import type { ProductStore } from "./product-store.js";
import type { UserStore } from "./auth.js";
import type { WorkspaceWorktreeCatalog } from "./worktrees/worktree-catalog.js";
import { isOrchestrated } from "./worktrees/orchestration.js";
import {
  canEditResource,
  canEditWorktree,
  canReviewWorktree,
  isSpaceEditor,
} from "./worktrees/worktree-policy.js";

const DEMO_HISTORY_INTERVAL_MS = 5_000;
const WORKSPACE_LIFECYCLE_REQUEST = Symbol("workspace-lifecycle-request");

export function createWorkspaceLifecycleCustomData(): Record<string, unknown> {
  const customData = Object.create(null) as Record<string, unknown> & {
    [WORKSPACE_LIFECYCLE_REQUEST]?: true;
  };
  customData[WORKSPACE_LIFECYCLE_REQUEST] = true;
  return customData;
}

export interface CollaborationStackOptions {
  readonly dbAdapter: IDatabaseAdapter;
  readonly historyDbAdapter: IHistoryDatabaseAdapter;
  readonly worktreeDbAdapter: IWorktreeDatabaseAdapter;
  readonly worktreeCatalog: WorkspaceWorktreeCatalog;
  readonly productStore: ProductStore;
  readonly authService: AuthService;
  readonly userStore: UserStore;
}

export interface CollaborationStack {
  readonly collabService: UniverCollabService;
  readonly historyService: UniverHistoryService;
  readonly worktreeService: UniverCollabWorktreeService;
  readonly handleHttp: RequestHandler;
  attachWebSocket(server: Server): void;
  dispose(): Promise<void>;
}

export function createCollaborationStack(
  options: CollaborationStackOptions
): CollaborationStack {
  const collabService = new UniverCollabService({
    dbAdapter: options.dbAdapter,
  });
  const ticketStore = new MemorySessionTicketStore();
  const endpoint = new UniverCollabEndpoint(collabService, { ticketStore });
  const worktreeService = new UniverCollabWorktreeService({
    trunk: {
      service: collabService,
      dbAdapter: options.dbAdapter,
    },
    dbAdapter: options.worktreeDbAdapter,
  });
  const worktreeEndpoint = new UniverCollabWorktreeEndpoint(worktreeService, {
    ticketStore,
  });
  const historyService = new UniverHistoryService({
    collabService,
    dbAdapter: options.historyDbAdapter,
    policy: new DefaultHistoryPolicy({
      timeIntervalMs: DEMO_HISTORY_INTERVAL_MS,
    }),
    userProvider: {
      async getUsers(userIds) {
        return userIds.flatMap((userId) => {
          const user = options.userStore.getById(userId);
          return user ? [protocolUser(user)] : [];
        });
      },
    },
  });
  historyService.attach(collabService);
  collabService.on("changesetCommitted", ({ changeset }) => {
    const name = committedUnitName(changeset.mutations);
    if (name) {
      options.productStore.renameByUnitID(changeset.unitID, name);
    }
  });
  const historyEndpoint = new UniverHistoryEndpoint(historyService);
  const transport = createNodeTransport();

  const requireReadableResource = (unitID: string, userId: string) => {
    const resource = options.productStore.getByUnitID(unitID);
    const role = resource
      ? options.productStore.getAccessRoleByID(resource.id, userId)
      : null;
    if (
      !resource ||
      resource.status !== "active" ||
      !role
    ) {
      throw new CollabError("UNIT_NOT_FOUND", "Unit is unavailable");
    }
    return { resource, role };
  };

  const requireEditableResource = (unitID: string, userId: string) => {
    const access = requireReadableResource(unitID, userId);
    if (access.role === "viewer") {
      throw new CollabError("PERMISSION_DENIED", "Unit is read-only");
    }
    return access;
  };

  collabService.use("createUnit", async (context, next) => {
    const resource = options.productStore.getByUnitID(
      context.request.snapshot.unitID
    );
    const staged = options.worktreeCatalog.getStagedResourceByUnitID(
      context.request.snapshot.unitID
    );
    const stagedRole = staged
      ? options.productStore.getSpaceRole(
          staged.spaceID,
          context.session.userId
        )
      : null;
    if (
      isOrchestrated(context.request.customData) &&
      staged &&
      isSpaceEditor(stagedRole) &&
      staged.type === context.request.snapshot.type &&
      (staged.status === "staged" ||
        staged.status === "activation-pending")
    ) {
      await next();
      return;
    }
    const role = resource
      ? options.productStore.getAccessRoleByID(
          resource.id,
          context.session.userId
        )
      : null;
    if (
      !resource ||
      resource.status !== "creating" ||
      resource.createdBy !== context.session.userId ||
      !role ||
      role === "viewer"
    ) {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Unit creation must start from the product application"
      );
    }
    await next();
  });
  collabService.use("deleteUnits", async (context, next) => {
    if (context.request.hardDelete) {
      throw new CollabError(
        "INVALID_REQUEST",
        "The Workspace Demo does not expose hard delete"
      );
    }
    requireWorkspaceLifecycleRequest(context.request.customData);
    for (const unitID of context.request.unitIDs) {
      requireLifecycleManager(unitID, context.session.userId);
    }
    await next();
  });
  collabService.use("recoverUnits", async (context, next) => {
    requireWorkspaceLifecycleRequest(context.request.customData);
    for (const unitID of context.request.unitIDs) {
      requireLifecycleManager(unitID, context.session.userId);
    }
    await next();
  });
  collabService.use("readUnitData", async (context, next) => {
    requireReadableResource(context.request.unitID, context.session.userId);
    await next();
  });

  function requireLifecycleManager(unitID: string, userId: string): void {
    const resource = options.productStore.getByUnitID(unitID);
    const role = resource
      ? options.productStore.getAccessRoleByID(resource.id, userId)
      : null;
    if (
      !resource ||
      !role ||
      (role !== "owner" &&
        !(resource.spaceType === "team" && role === "admin"))
    ) {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Unit lifecycle access is denied"
      );
    }
  }
  collabService.use("submitChangeset", async (context, next) => {
    requireEditableResource(
      context.request.changeset.unitID,
      context.session.userId
    );
    await next();
  });
  collabService.use("applyChangeset", async (context, next) => {
    requireEditableResource(
      context.request.changeset.unitID,
      context.session.userId
    );
    await next();
  });
  collabService.use("commitChangeset", async (context, next) => {
    requireEditableResource(
      context.request.changeset.unitID,
      context.session.userId
    );
    await next();
  });

  historyService.use("getHistoryList", async (context, next) => {
    requireReadableResource(context.request.unitID, context.session.userId);
    await next();
  });
  historyService.use("listHistoryCreators", async (context, next) => {
    requireReadableResource(context.request.unitID, context.session.userId);
    await next();
  });
  historyService.use("getHistoryChangesets", async (context, next) => {
    requireReadableResource(context.request.unitID, context.session.userId);
    await next();
  });

  endpoint.use("connect", async (context, next) => {
    context.member.name = (context.session.customData.user as DemoUser).name;
    await next();
  });
  endpoint.use("joinUnit", async (context, next) => {
    const { resource } = requireReadableResource(
      context.unitID,
      context.session.userId
    );
    await collabService.getUnit(
      {
        unitID: context.unitID,
        type: resource.type,
        revision: 0,
      },
      { session: context.session }
    );
    await next();
  });

  const requireWorktreeReview = (worktreeID: string, userID: string) => {
    const catalog = options.worktreeCatalog.get(worktreeID);
    if (!catalog) {
      throw new CollabError("UNIT_NOT_FOUND", "Worktree does not exist");
    }
    const spaceRole =
      catalog.scope.kind === "space"
        ? options.productStore.getSpaceRole(catalog.scope.spaceID, userID)
        : null;
    if (!canReviewWorktree(userID, catalog, spaceRole)) {
      throw new CollabError("UNIT_NOT_FOUND", "Worktree does not exist");
    }
    return catalog;
  };

  const requireWorktreeEdit = (worktreeID: string, userID: string) => {
    const catalog = requireWorktreeReview(worktreeID, userID);
    const spaceRole =
      catalog.scope.kind === "space"
        ? options.productStore.getSpaceRole(catalog.scope.spaceID, userID)
        : null;
    if (!canEditWorktree(userID, catalog, spaceRole)) {
      throw new CollabError("PERMISSION_DENIED", "Worktree is read-only");
    }
    return catalog;
  };

  const requireWorktreeUnitRead = (
    worktreeID: string,
    unitID: string,
    userID: string
  ) => {
    const catalog = requireWorktreeReview(worktreeID, userID);
    const mapping = catalog.units.find((unit) => unit.unitID === unitID);
    if (!mapping) {
      throw new CollabError("UNIT_NOT_FOUND", "Worktree Unit does not exist");
    }
    if (mapping.source === "trunk") {
      const resource = options.productStore.getByID(mapping.resourceID);
      const role = resource
        ? options.productStore.getAccessRoleByID(resource.id, userID)
        : null;
      if (!resource || resource.status !== "active" || !role) {
        throw new CollabError("UNIT_NOT_FOUND", "Worktree Unit is unavailable");
      }
    } else {
      const staged = options.worktreeCatalog.getStagedResource(
        mapping.resourceID
      );
      const role = staged
        ? options.productStore.getSpaceRole(staged.spaceID, userID)
        : null;
      if (!staged || staged.status === "discarded" || !role) {
        throw new CollabError("UNIT_NOT_FOUND", "Worktree Unit is unavailable");
      }
    }
    return { catalog, mapping };
  };

  const requireWorktreeUnitEdit = (
    worktreeID: string,
    unitID: string,
    userID: string
  ) => {
    const { catalog, mapping } = requireWorktreeUnitRead(
      worktreeID,
      unitID,
      userID
    );
    requireWorktreeEdit(worktreeID, userID);
    if (mapping.source === "trunk") {
      const role = options.productStore.getAccessRoleByID(
        mapping.resourceID,
        userID
      );
      if (!canEditResource(role)) {
        throw new CollabError("PERMISSION_DENIED", "Unit is read-only");
      }
    }
    return { catalog, mapping };
  };

  const requireOrchestrated = (customData: Record<PropertyKey, unknown>) => {
    if (!isOrchestrated(customData)) {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Worktree mutation must use the Workspace application"
      );
    }
  };

  worktreeService.use("readWorktreeData", async (context, next) => {
    const recoveringCreate =
      isOrchestrated(context.request.customData) &&
      options.worktreeCatalog.listPendingOperations().some(
        (operation) =>
          operation.kind === "create-worktree" &&
          operation.worktree.worktreeID === context.request.worktreeID &&
          operation.actorUserID === context.session.userId
      );
    if (recoveringCreate) {
      await next();
      return;
    }
    requireWorktreeReview(
      context.request.worktreeID,
      context.session.userId
    );
    await next();
  });
  const requireOrchestratedRequest = async (
    context: { readonly request: { readonly customData: Record<string, unknown> } },
    next: () => Promise<void>
  ) => {
    requireOrchestrated(context.request.customData);
    await next();
  };
  worktreeService.use("createWorktree", requireOrchestratedRequest);
  worktreeService.use("addWorktreeUnit", requireOrchestratedRequest);
  worktreeService.use("createWorktreeUnit", requireOrchestratedRequest);
  worktreeService.use("markWorktreeReady", requireOrchestratedRequest);
  worktreeService.use("reopenWorktree", requireOrchestratedRequest);
  worktreeService.use("discardWorktree", requireOrchestratedRequest);
  worktreeService.use("mergeWorktree", requireOrchestratedRequest);
  worktreeService.use("readUnitData", async (context, next) => {
    requireWorktreeUnitRead(
      context.request.worktreeID,
      context.request.unitID,
      context.session.userId
    );
    await next();
  });
  worktreeService.use("submitChangeset", async (context, next) => {
    requireOrchestrated(context.request.customData);
    requireWorktreeUnitEdit(
      context.request.worktreeID,
      context.request.changeset.unitID,
      context.session.userId
    );
    await next();
  });
  worktreeService.use("applyChangeset", async (context, next) => {
    requireOrchestrated(context.request.customData);
    requireWorktreeUnitEdit(
      context.request.worktreeID,
      context.request.changeset.unitID,
      context.session.userId
    );
    await next();
  });
  worktreeService.use("commitChangeset", async (context, next) => {
    requireOrchestrated(context.request.customData);
    requireWorktreeUnitEdit(
      context.request.worktreeID,
      context.request.changeset.unitID,
      context.session.userId
    );
    await next();
  });

  transport.use(async (context, next) => {
    if (context.kind === "http") {
      const user = options.authService.requireUser(context.incomingMessage);
      context.userId = user.userId;
      context.customData.user = user;
    }
    await next();
  });
  transport.use(historyEndpoint);
  transport.use(worktreeEndpoint);
  transport.use(endpoint);
  transport.use(async (context, next) => {
    if (context.kind === "http") {
      if (!context.response.writableEnded) {
        context.response.statusCode = 404;
        context.response.end("Not Found");
      }
      return;
    }
    if (context.kind === "websocket-open") {
      context.connection.close(1008, "Unknown collaboration endpoint");
      return;
    }
    await next();
  });

  let attachedServer: Server | undefined;
  let disposed = false;
  const handleUpgrade: NonNullable<Parameters<Server["on"]>[1]> = (
    request,
    socket,
    head
  ) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (
      url.pathname !== "/universer-api/comb/connect" &&
      !url.pathname.startsWith("/universer-api/worktrees/")
    ) {
      socket.destroy();
      return;
    }
    transport.handleUpgrade(request, socket, head);
  };

  return {
    collabService,
    historyService,
    worktreeService,
    handleHttp(request, response) {
      request.url = request.originalUrl;
      transport.handleRequest(request, response);
    },
    attachWebSocket(server) {
      if (attachedServer) {
        throw new Error("Collaboration WebSocket is already attached");
      }
      attachedServer = server;
      server.on("upgrade", handleUpgrade);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      attachedServer?.off("upgrade", handleUpgrade);
      attachedServer = undefined;
      await transport.dispose();
      await worktreeService.dispose();
      await historyService.dispose();
      await collabService.dispose();
      await ticketStore.dispose();
    },
  };
}

function requireWorkspaceLifecycleRequest(
  customData: Record<PropertyKey, unknown>
): void {
  if (customData[WORKSPACE_LIFECYCLE_REQUEST] !== true) {
    throw new CollabError(
      "PERMISSION_DENIED",
      "Unit lifecycle must use the Workspace application"
    );
  }
}

const UNIT_RENAME_MUTATIONS = new Set([
  "sheet.mutation.set-workbook-name",
  "doc.mutation.rename-doc",
  "slide.mutation.set-name",
]);

function committedUnitName(
  mutations: ReadonlyArray<{ readonly id: string; readonly data: string }>
): string | null {
  for (let index = mutations.length - 1; index >= 0; index -= 1) {
    const mutation = mutations[index]!;
    if (!UNIT_RENAME_MUTATIONS.has(mutation.id)) continue;
    try {
      const data = JSON.parse(mutation.data) as { readonly name?: unknown };
      if (typeof data.name === "string" && data.name.trim()) {
        return data.name.trim().slice(0, 120);
      }
    } catch {
      return null;
    }
  }
  return null;
}
