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
  const historyEndpoint = new UniverHistoryEndpoint(historyService);
  const transport = createNodeTransport();

  const requireActiveResource = (unitID: string, userId: string) => {
    const resource = options.productStore.getByUnitID(unitID);
    if (
      !resource ||
      resource.status !== "active" ||
      resource.ownerUserId !== userId
    ) {
      throw new CollabError("UNIT_NOT_FOUND", "Unit is unavailable");
    }
    return resource;
  };

  collabService.use("createUnit", async (context, next) => {
    const resource = options.productStore.getByUnitID(
      context.request.snapshot.unitID
    );
    if (
      !resource ||
      resource.status !== "creating" ||
      resource.ownerUserId !== context.session.userId
    ) {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Unit creation must start from the product application"
      );
    }
    await next();
  });
  collabService.use("readUnitData", async (context, next) => {
    requireActiveResource(context.request.unitID, context.session.userId);
    await next();
  });
  collabService.use("submitChangeset", async (context, next) => {
    requireActiveResource(
      context.request.changeset.unitID,
      context.session.userId
    );
    await next();
  });
  collabService.use("applyChangeset", async (context, next) => {
    requireActiveResource(
      context.request.changeset.unitID,
      context.session.userId
    );
    await next();
  });

  historyService.use("getHistoryList", async (context, next) => {
    requireActiveResource(context.request.unitID, context.session.userId);
    await next();
  });
  historyService.use("listHistoryCreators", async (context, next) => {
    requireActiveResource(context.request.unitID, context.session.userId);
    await next();
  });
  historyService.use("getHistoryChangesets", async (context, next) => {
    requireActiveResource(context.request.unitID, context.session.userId);
    await next();
  });

  endpoint.use("connect", async (context, next) => {
    context.member.name = (context.session.customData.user as DemoUser).name;
    await next();
  });
  endpoint.use("joinUnit", async (context, next) => {
    const resource = requireActiveResource(
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
