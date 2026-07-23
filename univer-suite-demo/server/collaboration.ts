import type { Server } from "node:http";
import { UniverCollabEndpoint } from "@univerjs/collaboration-endpoint";
import {
  DefaultHistoryPolicy,
  UniverHistoryService,
  type IHistoryDatabaseAdapter,
} from "@univerjs/collaboration-history";
import { UniverHistoryEndpoint } from "@univerjs/collaboration-history-endpoint";
import {
  CollabError,
  UniverCollabService,
  type IDatabaseAdapter,
} from "@univerjs/collaboration-service";
import { createNodeTransport } from "@univerjs/collaboration-transport-node";
import type { RequestHandler } from "express";
import type { AuthService } from "./auth.js";
import type { DemoUser } from "./demo-user.js";
import { protocolUser } from "./demo-user.js";
import type { ProductStore } from "./product-store.js";
import type { UserStore } from "./auth.js";

const DEMO_HISTORY_INTERVAL_MS = 5_000;

export interface CollaborationStackOptions {
  readonly dbAdapter: IDatabaseAdapter;
  readonly historyDbAdapter: IHistoryDatabaseAdapter;
  readonly productStore: ProductStore;
  readonly authService: AuthService;
  readonly userStore: UserStore;
}

export interface CollaborationStack {
  readonly collabService: UniverCollabService;
  readonly historyService: UniverHistoryService;
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
  const endpoint = new UniverCollabEndpoint(collabService);
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
  collabService.use("readUnitData", async (context, next) => {
    requireReadableResource(context.request.unitID, context.session.userId);
    await next();
  });
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

  transport.use(async (context, next) => {
    if (context.kind === "http") {
      const user = options.authService.requireUser(context.incomingMessage);
      context.userId = user.userId;
      context.customData.user = user;
    }
    await next();
  });
  transport.use(historyEndpoint);
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
    if (url.pathname !== "/universer-api/comb/connect") {
      socket.destroy();
      return;
    }
    transport.handleUpgrade(request, socket, head);
  };

  return {
    collabService,
    historyService,
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
      await historyService.dispose();
      await collabService.dispose();
    },
  };
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
