import type { Server } from "node:http";
import { UniverCollabEndpoint } from "@univerjs/collaboration-endpoint";
import {
  UniverCollabService,
  type IDatabaseAdapter,
} from "@univerjs/collaboration-service";
import { createNodeTransport } from "@univerjs/collaboration-transport-node";
import { UniverType } from "@univerjs/protocol";
import type { RequestHandler } from "express";
import type { DemoUser } from "./demo-user.js";

export interface CollaborationStackOptions {
  readonly dbAdapter: IDatabaseAdapter;
  readonly user: DemoUser;
}

export interface CollaborationStack {
  readonly collabService: UniverCollabService;
  readonly handleHttp: RequestHandler;
  attachWebSocket(server: Server): void;
  dispose(): Promise<void>;
}

/** 组装只属于协同核心的 Service、Endpoint 和 Transport。 */
export function createCollaborationStack(
  options: CollaborationStackOptions
): CollaborationStack {
  const collabService = new UniverCollabService({
    dbAdapter: options.dbAdapter,
  });
  const endpoint = new UniverCollabEndpoint(collabService);
  const transport = createNodeTransport();

  endpoint.use("connect", async (context, next) => {
    context.member.name = options.user.name;
    await next();
  });
  endpoint.use("joinUnit", async (context, next) => {
    await collabService.getUnit(
      {
        unitID: context.unitID,
        type: UniverType.UNIVER_SHEET,
        revision: 0,
      },
      { session: context.session }
    );
    await next();
  });

  // Demo 使用固定身份；生产应用应在这里把认证结果写入 Transport Context。
  transport.use(async (context, next) => {
    if (context.kind === "http") {
      context.userId = options.user.userId;
      context.customData.user = options.user;
    }
    await next();
  });
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

  const handleUpgrade: NonNullable<
    Parameters<Server["on"]>[1]
  > = (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/universer-api/comb/connect") {
      socket.destroy();
      return;
    }
    transport.handleUpgrade(request, socket, head);
  };

  return {
    collabService,

    // Express mount 会改写 request.url；Endpoint 需要看到完整 Protocol 路径。
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
      await collabService.dispose();
    },
  };
}
