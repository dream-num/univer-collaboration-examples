import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
// PDF conversion is opt-in: this side-effect import enables it before the Exchange Service starts.
import "@univerjs-pro/exchange-node/pdf";
import { SQLiteCommentDatabaseAdapter } from "@univerjs-pro/collaboration-comment-database-sqlite";
import { UniverCommentEndpoint } from "@univerjs-pro/collaboration-comment-endpoint";
import { UniverCommentService } from "@univerjs-pro/collaboration-comment-service";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { UniverExchangeEndpoint } from "@univerjs-pro/collaboration-exchange-endpoint";
import { UniverExchangeService } from "@univerjs-pro/collaboration-exchange-service";
import { LocalFileBlobStore } from "@univerjs-pro/collaboration-file-blob-local";
import { SQLiteFileDatabaseAdapter } from "@univerjs-pro/collaboration-file-database-sqlite";
import { UniverFileEndpoint } from "@univerjs-pro/collaboration-file-endpoint";
import { UniverFileService } from "@univerjs-pro/collaboration-file-service";
import { SQLiteHistoryDatabaseAdapter } from "@univerjs-pro/collaboration-history-database-sqlite";
import { UniverHistoryEndpoint } from "@univerjs-pro/collaboration-history-endpoint";
import { UniverHistoryService } from "@univerjs-pro/collaboration-history-service";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, type IAllowedRequest } from "@univerjs/protocol";
import type { UnitsResponse } from "../shared/units";
import { DEMO_USER, ensureUnits, units } from "./units";

const filename = process.env.DATABASE_PATH ?? fileURLToPath(new URL("../../.data/collaboration.sqlite", import.meta.url));
// Contents of images and attachments uploaded from the editors; their metadata shares the SQLite database.
const filesDirectory = process.env.FILES_PATH ?? fileURLToPath(new URL("../../.data/files", import.meta.url));
await mkdir(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const service = new UniverCollabService({ dbAdapter: database });
const fileDatabase = new SQLiteFileDatabaseAdapter({ filename });
const fileService = new UniverFileService({
  database: fileDatabase,
  blobStore: new LocalFileBlobStore({ directory: filesDirectory }),
  cleanup: { context: { userID: "system:file-cleanup" } },
});
const exchangeService = new UniverExchangeService({ collabService: service, fileService });
// Comments and history show who wrote what, so both ask the application for its users.
const userProvider = {
  async getUsers(userIDs: string[]) {
    return userIDs.map((userID) => ({
      userID,
      name: userID === DEMO_USER.userId ? DEMO_USER.displayName : userID,
      avatar: "",
      anonymous: false,
      canBindAnonymous: false,
      phone: "",
      email: "",
      createTimestamp: 0,
    }));
  },
};
const commentDatabase = new SQLiteCommentDatabaseAdapter({ filename });
const commentService = new UniverCommentService({ database: commentDatabase, userProvider });
const historyDatabase = new SQLiteHistoryDatabaseAdapter({ filename });
const historyService = new UniverHistoryService({
  collabService: service,
  dbAdapter: historyDatabase,
  userProvider,
});
const transport = createNodeTransport();
const endpoint = new UniverCollabEndpoint(service);
transport.use(async (context, next) => {
  context.userID = DEMO_USER.userId;
  await next();
});
endpoint.use("connect", async (context, next) => {
  context.member.name = DEMO_USER.displayName;
  await next();
});
transport.register(new UniverCommentEndpoint({ service: commentService, roomHost: endpoint }));
transport.register(new UniverHistoryEndpoint(historyService));
transport.register(endpoint);
// File first: the Transport disposes in reverse order, so Exchange is released before File.
transport.register(new UniverFileEndpoint(fileService));
transport.register(new UniverExchangeEndpoint(exchangeService));

const app = express();
app.get("/api/units", (_request, response) => {
  response.json({ units, user: DEMO_USER } satisfies UnitsResponse);
});
app.post("/universer-api/authz/-/object/-/batch_allowed", express.json(), (request, response) => {
  const body = request.body as { requests?: IAllowedRequest[] };
  response.json({
    error: { code: ErrorCode.OK, message: "" },
    objectActions: (body.requests ?? []).map((item) => ({
      unitID: item.unitID,
      objectID: item.objectID,
      actions: item.actions.map((action) => ({ action, allowed: true })),
    })),
  });
});
app.use(express.static(fileURLToPath(new URL("../web", import.meta.url))));
const server = createServer(app);
transport.attach(server);

async function dispose() {
  // Transport owns Endpoint; the application disposes Service before the injected database.
  await transport.dispose();
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  await historyService.dispose();
  await commentService.dispose();
  await fileService.dispose();
  await service.dispose();
  await historyDatabase.dispose();
  await commentDatabase.dispose();
  await fileDatabase.dispose();
  await database.dispose();
}

try {
  await ensureUnits(service);
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 3010);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  console.info(`All Unit is running at http://${host}:${port}`);
} catch (error) {
  await dispose();
  throw error;
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void dispose().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
