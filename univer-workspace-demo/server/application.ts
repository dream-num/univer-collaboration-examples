import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import type { UniverHistoryService } from "@univerjs-pro/collaboration-history-service";
import { SQLiteHistoryDatabaseAdapter } from "@univerjs-pro/collaboration-history-database-sqlite";
import type { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { SQLiteWorktreeDatabaseAdapter } from "@univerjs-pro/collaboration-worktree-database-sqlite";
import type { UniverCollabWorktreeService } from "@univerjs-pro/collaboration-worktree-service";
import { createCollaborationStack } from "./collaboration.js";
import { AuthService, UserStore } from "./auth.js";
import { errorHandler, notFoundHandler } from "./http.js";
import { ProductStore } from "./product-store.js";
import {
  createApplicationRouter,
  createProtocolCompatibilityRouter,
} from "./routes.js";
import { WorkspaceWorktreeCatalog } from "./worktrees/worktree-catalog.js";
import {
  createWorkspaceWorktreeApplication,
  type WorkspaceWorktreeApplication as WorkspaceWorktreeApplicationModule,
} from "./worktrees/worktree-application.js";
import { createWorkspaceWorktreeRouter } from "./worktrees/worktree-routes.js";

export interface WorkspaceApplicationOptions {
  readonly databaseFilename?: string;
  readonly serveClient?: boolean;
}

export interface WorkspaceApplication {
  readonly app: express.Express;
  readonly httpServer: Server;
  readonly database: SQLiteDatabaseAdapter;
  readonly historyDbAdapter: SQLiteHistoryDatabaseAdapter;
  readonly worktreeDbAdapter: SQLiteWorktreeDatabaseAdapter;
  readonly worktreeCatalog: WorkspaceWorktreeCatalog;
  readonly worktreeApplication: WorkspaceWorktreeApplicationModule;
  readonly productStore: ProductStore;
  readonly userStore: UserStore;
  readonly collabService: UniverCollabService;
  readonly historyService: UniverHistoryService;
  readonly worktreeService: UniverCollabWorktreeService;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export async function createWorkspaceApplication(
  options: WorkspaceApplicationOptions = {}
): Promise<WorkspaceApplication> {
  const databaseFilename = options.databaseFilename ?? defaultDatabaseFilename();
  mkdirSync(dirname(databaseFilename), { recursive: true });
  const database = new SQLiteDatabaseAdapter({ filename: databaseFilename });
  const historyDbAdapter = new SQLiteHistoryDatabaseAdapter({
    filename: databaseFilename,
  });
  const worktreeDbAdapter = new SQLiteWorktreeDatabaseAdapter({
    filename: databaseFilename,
  });
  const worktreeCatalog = new WorkspaceWorktreeCatalog(databaseFilename);
  const productStore = new ProductStore(databaseFilename);
  const userStore = new UserStore(databaseFilename);
  await userStore.ensurePresetUsers();
  const authService = new AuthService(userStore);
  const collaboration = createCollaborationStack({
    dbAdapter: database,
    historyDbAdapter,
    worktreeDbAdapter,
    worktreeCatalog,
    productStore,
    authService,
    userStore,
  });
  const worktreeApplication = createWorkspaceWorktreeApplication({
    catalog: worktreeCatalog,
    productStore,
    userStore,
    service: collaboration.worktreeService,
  });
  await worktreeApplication.reconcile();

  const app = express();
  app.use(
    "/api/worktrees",
    createWorkspaceWorktreeRouter({
      authService,
      application: worktreeApplication,
    })
  );
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
    worktreeDbAdapter,
    worktreeCatalog,
    worktreeApplication,
    productStore,
    userStore,
    collabService: collaboration.collabService,
    historyService: collaboration.historyService,
    worktreeService: collaboration.worktreeService,
    listen: (port = 3020, host = "127.0.0.1") =>
      listen(httpServer, port, host),
    close: async () => {
      if (closed) return;
      closed = true;
      await collaboration.dispose();
      await closeServer(httpServer);
      productStore.dispose();
      userStore.dispose();
      worktreeCatalog.dispose();
      await worktreeDbAdapter.dispose();
      await historyDbAdapter.dispose();
      await database.dispose();
    },
  };
}

function defaultDatabaseFilename(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../.data/univer-workspace-demo.sqlite"
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
