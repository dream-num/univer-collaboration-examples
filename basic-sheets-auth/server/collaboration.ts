import type { Server } from "node:http";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import {
  UniverHistoryService,
  type IHistoryDatabaseAdapter,
} from "@univerjs-pro/collaboration-history-service";
import { UniverHistoryEndpoint } from "@univerjs-pro/collaboration-history-endpoint";
import {
  CollabError,
  UniverCollabService,
  type IDatabaseAdapter,
} from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import type { RequestHandler } from "express";
import type { AuthService } from "./auth.js";
import type { AuthenticatedUser } from "./model.js";
import { canEdit, canRead, protocolUser } from "./model.js";
import type { ApplicationStore } from "./store.js";

export interface CollaborationStackOptions {
  readonly dbAdapter: IDatabaseAdapter;
  readonly historyDbAdapter: IHistoryDatabaseAdapter;
  readonly authService: AuthService;
  readonly store: ApplicationStore;
}

export interface CollaborationStack {
  readonly collabService: UniverCollabService;
  readonly historyService: UniverHistoryService;
  readonly handleHttp: RequestHandler;
  attachWebSocket(server: Server): void;
  dispose(): Promise<void>;
}

/** basic-sheets 的协同栈，仅增加认证身份与 Unit ACL middleware。 */
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
    userProvider: {
      async getUsers(userIDs) {
        return userIDs.flatMap((userId) => {
          const user = options.store.getUser(userId);
          return user ? [protocolUser(user)] : [];
        });
      },
    },
  });

  collabService.use("createUnit", async (context, next) => {
    const role = options.store.getRole(
      context.userID,
      context.request.snapshot.unitID
    );
    if (role !== "owner") {
      throw new CollabError(
        "PERMISSION_DENIED",
        "Only the owner can create this unit"
      );
    }
    await next();
  });
  collabService.use("readUnitData", async (context, next) => {
    requireRead(
      options.store,
      context.userID,
      context.request.unitID
    );
    await next();
  });
  collabService.use("submitChangeset", async (context, next) => {
    requireEdit(
      options.store,
      context.userID,
      context.request.changeset.unitID
    );
    await next();
  });
  collabService.use("applyChangeset", async (context, next) => {
    requireEdit(
      options.store,
      context.userID,
      context.request.changeset.unitID
    );
    await next();
  });

  historyService.use("getHistoryList", async (context, next) => {
    requireRead(
      options.store,
      context.userID,
      context.request.unitID
    );
    await next();
  });
  historyService.use("listHistoryCreators", async (context, next) => {
    requireRead(
      options.store,
      context.userID,
      context.request.unitID
    );
    await next();
  });
  historyService.use("getHistoryChangesets", async (context, next) => {
    requireRead(
      options.store,
      context.userID,
      context.request.unitID
    );
    await next();
  });
  historyService.use("indexUnitCreated", async (context, next) => {
    requireRead(
      options.store,
      context.userID,
      context.request.unitID
    );
    await next();
  });
  historyService.use("indexChangeset", async (context, next) => {
    requireRead(
      options.store,
      context.userID,
      context.request.changeset.unitID
    );
    await next();
  });
  historyService.attach(collabService);

  const historyEndpoint = new UniverHistoryEndpoint(historyService);
  const transport = createNodeTransport();

  endpoint.use("connect", async (context, next) => {
    const user = context.session.customData.user as
      | AuthenticatedUser
      | undefined;
    context.member.name = user?.name ?? context.session.userID;
    await next();
  });
  endpoint.use("joinUnit", async (context, next) => {
    requireRead(options.store, context.session.userID, context.unitID);
    await collabService.getUnit(
      {
        unitID: context.unitID,
        type: UniverType.UNIVER_SHEET,
        revision: 0,
      },
      { userID: context.session.userID }
    );
    await next();
  });

  // Host 认证 HTTP，Endpoint 再把可信身份绑定到一次性 WebSocket ticket。
  transport.use(async (context, next) => {
    if (context.kind === "http") {
      try {
        const user = await options.authService.requireUser(
          context.incomingMessage
        );
        context.userID = user.userId;
        context.customData.user = user;
      } catch {
        context.response.statusCode = 401;
        context.response.setHeader(
          "content-type",
          "application/json; charset=utf-8"
        );
        context.response.end(
          JSON.stringify({
            error: {
              code: ErrorCode.UNAUTHENTICATED,
              message: "Authentication required",
            },
          })
        );
        return;
      }
    }
    await next();
  });
  transport.use(historyEndpoint);
  transport.use(endpoint);

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

function requireRead(
  store: ApplicationStore,
  userId: string,
  unitID: string
): void {
  if (!canRead(store.getRole(userId, unitID))) {
    throw new CollabError("PERMISSION_DENIED", "Cannot read this unit");
  }
}

function requireEdit(
  store: ApplicationStore,
  userId: string,
  unitID: string
): void {
  if (!canEdit(store.getRole(userId, unitID))) {
    throw new CollabError("PERMISSION_DENIED", "Unit is read-only");
  }
}
