import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import {
  CollabError,
  UniverCollabService,
  type CollabSession,
} from "@univerjs/collaboration-service";
import { UniverCollabEndpoint } from "@univerjs/collaboration-endpoint";
import {
  createNodeTransport,
  type NodeHttpTransportContext,
  type NodeTransportMiddleware,
} from "@univerjs/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import { DEMO_USER, protocolUser } from "./demo-user.js";
import { createHistoryHttpMiddleware } from "./history-http.js";
import { HistoryStore } from "./history-store.js";
import { createEmptyWorkbookData } from "./workbook-data.js";

const OK_ERROR = { code: ErrorCode.OK, message: "" };

export interface BasicSheetsApplicationOptions {
  readonly databaseFilename?: string;
  readonly serveClient?: boolean;
}

export interface BasicSheetsApplication {
  readonly app: express.Express;
  readonly httpServer: Server;
  readonly database: SQLiteDatabaseAdapter;
  readonly historyStore: HistoryStore;
  readonly collabService: UniverCollabService;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export async function createBasicSheetsApplication(
  options: BasicSheetsApplicationOptions = {}
): Promise<BasicSheetsApplication> {
  const databaseFilename = options.databaseFilename ?? defaultDatabaseFilename();
  mkdirSync(dirname(databaseFilename), { recursive: true });
  const database = new SQLiteDatabaseAdapter({ filename: databaseFilename });
  const historyStore = new HistoryStore(databaseFilename);
  const collabService = new UniverCollabService({ dbAdapter: database });
  const endpoint = new UniverCollabEndpoint(collabService);
  const transport = createNodeTransport();

  collabService.on("changesetCommitted", ({ changeset }) => {
    historyStore.recordChangeset(changeset);
  });

  endpoint.use("connect", async (context, next) => {
    context.member.name = DEMO_USER.name;
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

  transport.use(async (context, next) => {
    if (context.kind === "http") {
      context.userId = DEMO_USER.userId;
      context.customData.user = DEMO_USER;
    }
    await next();
  });
  transport.use(createDemoProtocolMiddleware(collabService, historyStore));
  transport.use(
    createHistoryHttpMiddleware(collabService, historyStore, DEMO_USER)
  );
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

  const app = express();
  app.use((request, response, next) => {
    if (!request.path.startsWith("/universer-api/")) {
      next();
      return;
    }
    transport.handleRequest(request, response);
  });

  if (options.serveClient !== false) {
    const clientDirectory = join(
      dirname(fileURLToPath(import.meta.url)),
      "../dist/client"
    );
    app.use(express.static(clientDirectory));
    app.get("/{*path}", (_request, response) => {
      response.sendFile(join(clientDirectory, "index.html"));
    });
  }

  const httpServer = createServer(app);
  httpServer.on("upgrade", (request, socket, head) => {
    if (!request.url?.startsWith("/universer-api/")) {
      socket.destroy();
      return;
    }
    transport.handleUpgrade(request, socket, head);
  });

  let closed = false;
  return {
    app,
    httpServer,
    database,
    historyStore,
    collabService,
    listen: (port = 3010, host = "127.0.0.1") =>
      listen(httpServer, port, host),
    close: async () => {
      if (closed) return;
      closed = true;
      await transport.dispose();
      await closeServer(httpServer);
      await collabService.dispose();
      await historyStore.dispose();
      await database.dispose();
    },
  };
}

function createDemoProtocolMiddleware(
  service: UniverCollabService,
  store: HistoryStore
): NodeTransportMiddleware {
  return async (context, next) => {
    if (context.kind !== "http") {
      await next();
      return;
    }
    const url = new URL(context.incomingMessage.url ?? "/", "http://localhost");

    if (
      context.incomingMessage.method === "GET" &&
      url.pathname === "/universer-api/user"
    ) {
      writeJson(context, 200, {
        error: OK_ERROR,
        user: protocolUser(DEMO_USER),
        wechat: undefined,
      });
      return;
    }

    if (
      context.incomingMessage.method === "POST" &&
      url.pathname === "/universer-api/authz/-/object/-/batch_allowed"
    ) {
      // 本 example 不实现 ACL，只为上游 Sheet 前端返回固定授权结果。
      // 生产应用应在 Service lifecycle middleware 中执行真实权限判断。
      const body = await context.readJson<{
        readonly requests?: readonly {
          readonly unitID?: unknown;
          readonly objectID?: unknown;
          readonly actions?: readonly unknown[];
        }[];
      }>();
      if (!Array.isArray(body.requests)) {
        throw new CollabError("INVALID_REQUEST", "requests must be an array");
      }
      writeJson(context, 200, {
        error: OK_ERROR,
        objectActions: body.requests.map((request) => ({
          unitID: typeof request.unitID === "string" ? request.unitID : "",
          objectID: typeof request.objectID === "string" ? request.objectID : "",
          actions: Array.isArray(request.actions)
            ? request.actions.map((action: unknown) => ({ action, allowed: true }))
            : [],
        })),
      });
      return;
    }

    if (
      context.incomingMessage.method === "POST" &&
      url.pathname === "/universer-api/snapshot/2/unit/-/create"
    ) {
      const body = await context.readJson<{ readonly name?: unknown }>();
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 120)
          : "Collaborative Sheet";
      const unitID = randomUUID();
      const data = createEmptyWorkbookData(unitID, name);
      await service.createUnitFromData(
        { type: UniverType.UNIVER_SHEET, data },
        {
          session: callerSession(),
          customData: context.customData,
        }
      );
      store.recordInitialHistory(unitID, DEMO_USER.userId);
      writeJson(context, 201, { unitID, type: UniverType.UNIVER_SHEET });
      return;
    }

    await next();
  };
}

function callerSession(): CollabSession {
  return {
    memberId: `http-${randomUUID()}`,
    userId: DEMO_USER.userId,
    customData: { user: DEMO_USER },
  };
}

function writeJson(
  context: NodeHttpTransportContext,
  status: number,
  body: unknown
): void {
  context.response.statusCode = status;
  context.response.setHeader("content-type", "application/json; charset=utf-8");
  context.response.end(JSON.stringify(body));
}

function defaultDatabaseFilename(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../.data/basic-sheets.sqlite");
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server did not expose a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
