import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import type { UniverHistoryService } from "@univerjs/collaboration-history";
import { SQLiteHistoryDatabaseAdapter } from "@univerjs/collaboration-history-sqlite";
import type { UniverCollabService } from "@univerjs/collaboration-service";
import { createCollaborationStack } from "./collaboration.js";
import { AuthService, UserStore } from "./auth.js";
import { errorHandler, notFoundHandler } from "./http.js";
import { ProductStore } from "./product-store.js";
import {
  createApplicationRouter,
  createProtocolCompatibilityRouter,
} from "./routes.js";

export interface SuiteApplicationOptions {
  readonly databaseFilename?: string;
  readonly serveClient?: boolean;
}

export interface SuiteApplication {
  readonly app: express.Express;
  readonly httpServer: Server;
  readonly database: SQLiteDatabaseAdapter;
  readonly historyDbAdapter: SQLiteHistoryDatabaseAdapter;
  readonly productStore: ProductStore;
  readonly userStore: UserStore;
  readonly collabService: UniverCollabService;
  readonly historyService: UniverHistoryService;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export async function createSuiteApplication(
  options: SuiteApplicationOptions = {}
): Promise<SuiteApplication> {
  const databaseFilename = options.databaseFilename ?? defaultDatabaseFilename();
  mkdirSync(dirname(databaseFilename), { recursive: true });
  const database = new SQLiteDatabaseAdapter({ filename: databaseFilename });
  const historyDbAdapter = new SQLiteHistoryDatabaseAdapter({
    filename: databaseFilename,
  });
  const productStore = new ProductStore(databaseFilename);
  const userStore = new UserStore(databaseFilename);
  await userStore.ensurePresetUsers();
  const authService = new AuthService(userStore);
  const collaboration = createCollaborationStack({
    dbAdapter: database,
    historyDbAdapter,
    productStore,
    authService,
    userStore,
  });

  const app = express();
  app.use(
    "/api",
    createApplicationRouter({
      collabService: collaboration.collabService,
      productStore,
      authService,
      userStore,
    })
  );
  app.use(
    "/universer-api",
    createProtocolCompatibilityRouter({ authService, productStore })
  );
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
    historyDbAdapter,
    productStore,
    userStore,
    collabService: collaboration.collabService,
    historyService: collaboration.historyService,
    listen: (port = 3020, host = "127.0.0.1") =>
      listen(httpServer, port, host),
    close: async () => {
      if (closed) return;
      closed = true;
      await collaboration.dispose();
      await closeServer(httpServer);
      productStore.dispose();
      userStore.dispose();
      await historyDbAdapter.dispose();
      await database.dispose();
    },
  };
}

function defaultDatabaseFilename(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../.data/univer-suite-demo.sqlite"
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
