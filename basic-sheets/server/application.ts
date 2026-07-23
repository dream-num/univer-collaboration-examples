import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs/collaboration-endpoint";
import {
  CollabError,
  UniverCollabService,
  type CollabSession,
} from "@univerjs/collaboration-service";
import { createNodeTransport } from "@univerjs/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import { DEMO_USER, protocolUser } from "./demo-user.js";
import { createHistoryRouter } from "./history-http.js";
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

  // Transport 只处理协同核心请求；这里模拟应用已经完成身份认证。
  transport.use(async (context, next) => {
    if (context.kind === "http") {
      context.userId = DEMO_USER.userId;
      context.customData.user = DEMO_USER;
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

  const app = express();

  // 用户、权限、Unit 产品入口和 History 都属于应用层，由 Express 明确实现。
  registerApplicationRoutes(app, collabService, historyStore);

  // 只有协同核心协议进入 Transport → UniverCollabEndpoint。
  app.use((request, response, next) => {
    if (!isCollaborationHttpRequest(request)) {
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
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/universer-api/comb/connect") {
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

function registerApplicationRoutes(
  app: express.Express,
  service: UniverCollabService,
  store: HistoryStore
): void {
  const jsonBody = express.json({ limit: "1mb" });

  app.get("/universer-api/user", (_request, response) => {
    response.status(200).json({
      error: OK_ERROR,
      user: protocolUser(DEMO_USER),
      wechat: undefined,
    });
  });

  app.post(
    "/universer-api/authz/-/object/-/batch_allowed",
    jsonBody,
    (request, response) => {
      // 本 example 不实现 ACL，只为上游 Sheet 前端返回固定授权结果。
      // 生产应用应在 Service lifecycle middleware 中执行真实权限判断。
      const body = request.body as {
        readonly requests?: readonly {
          readonly unitID?: unknown;
          readonly objectID?: unknown;
          readonly actions?: readonly unknown[];
        }[];
      };
      if (!Array.isArray(body.requests)) {
        response.status(400).json({
          error: {
            code: ErrorCode.INVALID_ARGUMENT,
            message: "requests must be an array",
          },
        });
        return;
      }
      response.status(200).json({
        error: OK_ERROR,
        objectActions: body.requests.map((item) => ({
          unitID: typeof item.unitID === "string" ? item.unitID : "",
          objectID: typeof item.objectID === "string" ? item.objectID : "",
          actions: Array.isArray(item.actions)
            ? item.actions.map((action: unknown) => ({ action, allowed: true }))
            : [],
        })),
      });
    }
  );

  app.post(
    "/universer-api/snapshot/2/unit/-/create",
    jsonBody,
    async (request, response) => {
      const body = request.body as { readonly name?: unknown };
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 120)
          : "Collaborative Sheet";
      const unitID = randomUUID();
      const data = createEmptyWorkbookData(unitID, name);
      try {
        await service.createUnitFromData(
          { type: UniverType.UNIVER_SHEET, data },
          {
            session: callerSession(),
            customData: { user: DEMO_USER },
          }
        );
        store.recordInitialHistory(unitID, DEMO_USER.userId);
        response
          .status(201)
          .json({ unitID, type: UniverType.UNIVER_SHEET });
      } catch (error) {
        writeApplicationFailure(response, error);
      }
    }
  );

  app.use(
    "/universer-api/history",
    createHistoryRouter(service, store, DEMO_USER)
  );
}

function callerSession(): CollabSession {
  return {
    memberId: `http-${randomUUID()}`,
    userId: DEMO_USER.userId,
    customData: { user: DEMO_USER },
  };
}

function writeApplicationFailure(response: Response, error: unknown): void {
  const invalidRequest =
    error instanceof CollabError && error.code === "INVALID_REQUEST";
  response.status(invalidRequest ? 400 : 500).json({
    error: {
      code: invalidRequest
        ? ErrorCode.INVALID_ARGUMENT
        : ErrorCode.INTERNAL_ERROR,
      message: invalidRequest ? error.message : "Internal server error",
    },
  });
}

function isCollaborationHttpRequest(request: Request): boolean {
  return (
    (request.method === "GET" &&
      request.path === "/universer-api/user/session-ticket") ||
    request.path.startsWith("/universer-api/snapshot/") ||
    request.path.startsWith("/universer-api/comb/")
  );
}

function defaultDatabaseFilename(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../.data/basic-sheets.sqlite"
  );
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
