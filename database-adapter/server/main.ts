import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import express from "express";
import { LocaleType, type IWorkbookData } from "@univerjs/core";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import {
  CollabError,
  UniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";

const UNIT_ID = "persistent-sheet";
const filename = ".data/collaboration.sqlite";
const unitData: IWorkbookData = {
  id: UNIT_ID,
  rev: 1,
  name: "Persistent Sheet",
  appVersion: "",
  locale: LocaleType.EN_US,
  sheetOrder: ["sheet-1"],
  sheets: {
    "sheet-1": {
      id: "sheet-1",
      name: "Sheet 1",
      rowCount: 100,
      columnCount: 26,
      cellData: {},
    },
  },
  styles: {},
  resources: [],
};

await mkdir(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const service = new UniverCollabService({ dbAdapter: database });
const endpoint = new UniverCollabEndpoint(service);
const transport = createNodeTransport();
endpoint.use("connect", async (context, next) => {
  context.member.name = "Demo User";
  await next();
});
transport.use(async (context, next) => {
  context.userID = "demo-user";
  await next();
});
transport.register(endpoint);

try {
  await service.getUnit(
    { unitID: UNIT_ID, type: UniverType.UNIVER_SHEET, revision: 0 },
    { userID: "demo-user" },
  );
} catch (error) {
  if (!(error instanceof CollabError) || error.code !== "UNIT_NOT_FOUND")
    throw error;
  await service.createUnitFromData(
    { type: UniverType.UNIVER_SHEET, data: unitData },
    { userID: "demo-user" },
  );
}

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
app.use("/universer-api", (request, response) => {
  request.url = request.originalUrl;
  transport.handleRequest(request, response);
});
app.use(express.static("dist/web"));
const server = createServer(app);
server.on("upgrade", (request, socket, head) =>
  transport.handleUpgrade(request, socket, head),
);
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3010);
server.listen(port, host, () =>
  console.info(
    `Database Adapter is running at http://${host}:${port}/?unit=${UNIT_ID}&type=${UniverType.UNIVER_SHEET}`,
  ),
);
