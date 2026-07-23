import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import type { UniverCollabService } from "@univerjs/collaboration-service";
import { createCollaborationStack } from "./collaboration.js";
import { DEMO_USER } from "./demo-user.js";
import { HistoryStore } from "./history-store.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { createAuthzRouter } from "./routes/authz.js";
import { createHistoryRouter } from "./routes/history.js";
import { createUnitRouter } from "./routes/unit.js";
import { createUserRouter } from "./routes/user.js";

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
  const collaboration = createCollaborationStack({
    dbAdapter: database,
    user: DEMO_USER,
  });

  const historySubscription = collaboration.collabService.on(
    "changesetCommitted",
    ({ changeset }) => {
      historyStore.recordChangeset(changeset);
    }
  );

  const app = express();
  const applicationRouter = Router();

  applicationRouter.use(
    "/user",
    createUserRouter({
      user: DEMO_USER,
    })
  );
  applicationRouter.use("/authz", createAuthzRouter());
  applicationRouter.use(
    "/history",
    createHistoryRouter({
      collabService: collaboration.collabService,
      historyStore,
      user: DEMO_USER,
    })
  );
  applicationRouter.use(
    "/snapshot",
    createUnitRouter({
      collabService: collaboration.collabService,
      historyStore,
      user: DEMO_USER,
    })
  );

  app.use("/universer-api", applicationRouter);

  // 应用 Router 没有处理的协同协议请求再交给 Transport。
  app.use("/universer-api", collaboration.handleHttp);

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

  app.use(notFoundHandler);
  app.use(errorHandler);

  const httpServer = createServer(app);
  collaboration.attachWebSocket(httpServer);

  let closed = false;
  return {
    app,
    httpServer,
    database,
    historyStore,
    collabService: collaboration.collabService,
    listen: (port = 3010, host = "127.0.0.1") =>
      listen(httpServer, port, host),
    close: async () => {
      if (closed) return;
      closed = true;
      historySubscription.dispose();
      await collaboration.dispose();
      await closeServer(httpServer);
      await historyStore.dispose();
      await database.dispose();
    },
  };
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
