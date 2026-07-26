import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import type { UniverHistoryService } from "@univerjs/collaboration-history-service";
import { SQLiteHistoryDatabaseAdapter } from "@univerjs/collaboration-history-database-sqlite";
import type { UniverCollabService } from "@univerjs/collaboration-service";
import { AuthService } from "./auth.js";
import { createCollaborationStack } from "./collaboration.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { createAccessRouter } from "./routes/access.js";
import { createAuthRouter } from "./routes/auth.js";
import { createAuthzRouter } from "./routes/authz.js";
import { createUnitRouter } from "./routes/unit.js";
import { createUserRouter } from "./routes/user.js";
import { ApplicationStore } from "./store.js";

export interface BasicSheetsAuthApplicationOptions {
  readonly databaseFilename?: string;
  readonly jwtSecret?: string;
  readonly serveClient?: boolean;
}

export interface BasicSheetsAuthApplication {
  readonly app: express.Express;
  readonly httpServer: Server;
  readonly database: SQLiteDatabaseAdapter;
  readonly historyDbAdapter: SQLiteHistoryDatabaseAdapter;
  readonly store: ApplicationStore;
  readonly collabService: UniverCollabService;
  readonly historyService: UniverHistoryService;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export async function createBasicSheetsAuthApplication(
  options: BasicSheetsAuthApplicationOptions = {}
): Promise<BasicSheetsAuthApplication> {
  const databaseFilename = options.databaseFilename ?? defaultDatabaseFilename();
  mkdirSync(dirname(databaseFilename), { recursive: true });

  const database = new SQLiteDatabaseAdapter({ filename: databaseFilename });
  const historyDbAdapter = new SQLiteHistoryDatabaseAdapter({
    filename: databaseFilename,
  });
  const store = new ApplicationStore(databaseFilename);
  await store.ensurePresetUsers();
  const authService = new AuthService(
    store,
    options.jwtSecret ?? "basic-sheets-auth-local-secret"
  );
  const collaboration = createCollaborationStack({
    dbAdapter: database,
    historyDbAdapter,
    authService,
    store,
  });

  const app = express();
  app.use(
    "/api/auth",
    createAuthRouter({
      authService,
      store,
    })
  );

  app.use(["/api/units", "/universer-api"], async (request, response, next) => {
    try {
      response.locals.user = await authService.requireUser(request);
      next();
    } catch (error) {
      next(error);
    }
  });

  const protocolRouter = Router();
  protocolRouter.use("/user", createUserRouter());
  protocolRouter.use("/authz", createAuthzRouter(store));
  protocolRouter.use(
    "/snapshot",
    createUnitRouter({
      collabService: collaboration.collabService,
      store,
    })
  );
  app.use("/universer-api", protocolRouter);
  app.use("/universer-api", collaboration.handleHttp);
  app.use("/api/units", createAccessRouter(store));

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
    historyDbAdapter,
    store,
    collabService: collaboration.collabService,
    historyService: collaboration.historyService,
    listen: (port = 3010, host = "127.0.0.1") =>
      listen(httpServer, port, host),
    close: async () => {
      if (closed) return;
      closed = true;
      await collaboration.dispose();
      await closeServer(httpServer);
      store.dispose();
      await historyDbAdapter.dispose();
      await database.dispose();
    },
  };
}

function defaultDatabaseFilename(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../.data/basic-sheets-auth.sqlite"
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
