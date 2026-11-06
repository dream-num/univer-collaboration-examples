import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import express from "express";
import { LocaleType, type IWorkbookData } from "@univerjs/core";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { LocalFileBlobStore } from "@univerjs-pro/collaboration-file-blob-local";
import { SQLiteFileDatabaseAdapter } from "@univerjs-pro/collaboration-file-database-sqlite";
import { UniverFileEndpoint } from "@univerjs-pro/collaboration-file-endpoint";
import { UniverFileService } from "@univerjs-pro/collaboration-file-service";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";

const UNIT_ID = "file-service-sheet";
const USER_ID = `User-${randomUUID().slice(0, 4)}`;
const filename = ".data/collaboration.sqlite";
// File contents are written here; their metadata shares the SQLite database with the collaboration data.
const filesDirectory = resolve(".data/files");
const unitData: IWorkbookData = {
  id: UNIT_ID,
  rev: 1,
  name: "File Service Sheet",
  appVersion: "",
  locale: LocaleType.EN_US,
  sheetOrder: ["sheet-1"],
  sheets: {
    "sheet-1": {
      id: "sheet-1",
      name: "Sheet 1",
      rowCount: 100,
      columnCount: 26,
      cellData: {
        0: { 0: { v: "Insert an image; it is uploaded to this server and survives a restart." } },
      },
    },
  },
  styles: {},
  resources: [],
};

await mkdir(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const service = new UniverCollabService({ dbAdapter: database });
const endpoint = new UniverCollabEndpoint(service);
const fileService = new UniverFileService({
  database: new SQLiteFileDatabaseAdapter({ filename }),
  blobStore: new LocalFileBlobStore({ directory: filesDirectory }),
  cleanup: { context: { userID: "system:file-cleanup" } },
});
const transport = createNodeTransport();

transport.use(async (context, next) => {
  context.userID = USER_ID;
  await next();
});
endpoint.use("connect", async (context, next) => {
  context.member.name = context.session.userID;
  await next();
});
transport.register(endpoint);
transport.register(new UniverFileEndpoint(fileService));

// Seed the demo Unit; if it already exists, this returns "already-exists" instead of creating it or throwing.
await service.createUnitFromData(
  { type: UniverType.UNIVER_SHEET, data: unitData },
  { userID: USER_ID },
);

const app = express();
app.post(
  "/universer-api/authz/-/object/-/batch_allowed",
  express.json(),
  (request, response) => {
    const body = request.body as {
      requests: Array<{ unitID: string; objectID: string; actions: unknown[] }>;
    };
    response.json({
      error: { code: ErrorCode.OK, message: "" },
      objectActions: body.requests.map((item) => ({
        unitID: item.unitID,
        objectID: item.objectID,
        actions: item.actions.map((action) => ({ action, allowed: true })),
      })),
    });
  },
);
app.use(express.static("dist/web"));

const server = createServer(app);
transport.attach(server);

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3010);
server.listen(port, host, () => {
  console.info(
    `File Service is running at http://${host}:${port}/?unit=${UNIT_ID}`,
  );
});
