import type { Server } from "node:http";
import {
  MemorySessionTicketStore,
  UniverCollabEndpoint,
} from "@univerjs-pro/collaboration-endpoint";
import {
  UniverCollabService,
  type IDatabaseAdapter,
} from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import type { IWorktreeDatabaseAdapter } from "@univerjs-pro/collaboration-worktree-service";
import { UniverCollabWorktreeService } from "@univerjs-pro/collaboration-worktree-service";
import { UniverCollabWorktreeEndpoint } from "@univerjs-pro/collaboration-worktree-endpoint";
import type { RequestHandler } from "express";
import type { DemoUser } from "./demo-user.js";

export interface WorktreeCollaborationStackOptions {
  readonly dbAdapter: IDatabaseAdapter;
  readonly worktreeDbAdapter: IWorktreeDatabaseAdapter;
  readonly user: DemoUser;
}

export interface WorktreeCollaborationStack {
  readonly collabService: UniverCollabService;
  readonly worktreeService: UniverCollabWorktreeService;
  readonly handleHttp: RequestHandler;
  attachWebSocket(server: Server): void;
  dispose(): Promise<void>;
}

export function createWorktreeCollaborationStack(
  options: WorktreeCollaborationStackOptions
): WorktreeCollaborationStack {
  const collabService = new UniverCollabService({
    dbAdapter: options.dbAdapter,
  });
  const worktreeService = new UniverCollabWorktreeService({
    trunk: { service: collabService, dbAdapter: options.dbAdapter },
    dbAdapter: options.worktreeDbAdapter,
  });
  const ticketStore = new MemorySessionTicketStore();
  const trunkEndpoint = new UniverCollabEndpoint(collabService, {
    ticketStore,
  });
  const worktreeEndpoint = new UniverCollabWorktreeEndpoint(
    worktreeService,
    { ticketStore }
  );
  const transport = createNodeTransport();

  trunkEndpoint.use("connect", async (context, next) => {
    context.member.name = options.user.name;
    await next();
  });
  worktreeEndpoint.use("connect", async (context, next) => {
    context.member.name = options.user.name;
    await next();
  });
  // Demo 使用固定身份；生产应用应在这里接入自己的认证结果。
  transport.use(async (context, next) => {
    if (context.kind === "http") {
      context.userID = options.user.userId;
      context.customData.user = options.user;
    }
    await next();
  });
  transport.use(worktreeEndpoint);
  transport.use(trunkEndpoint);
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
    const pathname = new URL(
      request.url ?? "/",
      "http://localhost"
    ).pathname;
    if (
      pathname !== "/universer-api/comb/connect" &&
      !pathname.startsWith("/universer-api/worktrees/")
    ) {
      socket.destroy();
      return;
    }
    transport.handleUpgrade(request, socket, head);
  };

  return {
    collabService,
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
      await collabService.dispose();
    },
  };
}
