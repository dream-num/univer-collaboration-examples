import { mkdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import { SQLiteWorktreeDatabaseAdapter } from "@univerjs/collaboration-worktree-database-sqlite";
import {
  CollabError,
  type UniverCollabService,
} from "@univerjs/collaboration-service";
import type { UniverCollabWorktreeService } from "@univerjs/collaboration-worktree-service";
import {
  DEMO_TRUNK_UNIT_ID,
  DEMO_TRUNK_UNIT_TYPE,
} from "../shared/demo.js";
import { createWorktreeCollaborationStack } from "./collaboration.js";
import { DEMO_USER } from "./demo-user.js";
import { demoCallOptions } from "./demo-session.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { createAuthzRouter } from "./routes/authz.js";
import { createUserRouter } from "./routes/user.js";
import { createWorktreeRouter } from "./routes/worktrees.js";
import { createDemoTrunkWorkbookData } from "./workbook-data.js";
import { WorktreeCatalog } from "./worktree-catalog.js";

export interface BasicSheetsWorktreeApplicationOptions {
  readonly databaseFilename?: string;
  readonly serveClient?: boolean;
}

export interface BasicSheetsWorktreeApplication {
  readonly app: express.Express;
  readonly httpServer: Server;
  readonly database: SQLiteDatabaseAdapter;
  readonly worktreeDatabase: SQLiteWorktreeDatabaseAdapter;
  readonly worktreeCatalog: WorktreeCatalog;
  readonly collabService: UniverCollabService;
  readonly worktreeService: UniverCollabWorktreeService;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export async function createBasicSheetsWorktreeApplication(
  options: BasicSheetsWorktreeApplicationOptions = {}
): Promise<BasicSheetsWorktreeApplication> {
  const filename = options.databaseFilename ?? defaultDatabaseFilename();
  mkdirSync(dirname(filename), { recursive: true });
  const database = new SQLiteDatabaseAdapter({ filename });
  const worktreeDatabase = new SQLiteWorktreeDatabaseAdapter({ filename });
  const worktreeCatalog = new WorktreeCatalog(filename);
  const collaboration = createWorktreeCollaborationStack({
    dbAdapter: database,
    worktreeDbAdapter: worktreeDatabase,
    user: DEMO_USER,
  });
  await ensureDemoTrunkUnit(collaboration.collabService);
  collaboration.worktreeService.on(
    "worktreeStatusChanged",
    ({ worktree, status, occurredAt }) => {
      if (status === "merged" || status === "discarded") {
        worktreeCatalog.markCompleted(worktree.worktreeID, occurredAt);
      }
    }
  );

  const app = express();
  const applicationRouter = Router();
  applicationRouter.use("/user", createUserRouter(DEMO_USER));
  applicationRouter.use("/authz", createAuthzRouter());
  app.use(
    "/api/worktrees",
    createWorktreeRouter({
      catalog: worktreeCatalog,
      service: collaboration.worktreeService,
      user: DEMO_USER,
    })
  );
  app.use("/universer-api", applicationRouter);
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
    worktreeDatabase,
    worktreeCatalog,
    collabService: collaboration.collabService,
    worktreeService: collaboration.worktreeService,
    listen: (port = 3020, host = "127.0.0.1") =>
      listen(httpServer, port, host),
    close: async () => {
      if (closed) return;
      closed = true;
      await collaboration.dispose();
      await closeServer(httpServer);
      worktreeCatalog.dispose();
      await worktreeDatabase.dispose();
      await database.dispose();
    },
  };
}

async function ensureDemoTrunkUnit(
  service: UniverCollabService
): Promise<void> {
  try {
    await service.getUnit(
      {
        unitID: DEMO_TRUNK_UNIT_ID,
        type: DEMO_TRUNK_UNIT_TYPE,
        revision: 0,
      },
      demoCallOptions(DEMO_USER)
    );
  } catch (error) {
    if (
      !(error instanceof CollabError) ||
      error.code !== "UNIT_NOT_FOUND"
    ) {
      throw error;
    }
    await service.createUnitFromData(
      {
        type: DEMO_TRUNK_UNIT_TYPE,
        data: createDemoTrunkWorkbookData(),
      },
      demoCallOptions(DEMO_USER)
    );
  }
}

function defaultDatabaseFilename(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../.data/basic-sheets-worktree.sqlite"
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
