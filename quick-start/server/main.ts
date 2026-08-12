import { createServer } from "node:http";
import express from "express";
import { LocaleType, type IWorkbookData } from "@univerjs/core";
import { MemoryDatabaseAdapter } from "@univerjs-pro/collaboration-database-memory";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";

const UNIT_ID = "quick-start-sheet";
const unitData: IWorkbookData = {
  id: UNIT_ID,
  rev: 1,
  name: "Quick Start Sheet",
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

const database = new MemoryDatabaseAdapter();
const service = new UniverCollabService({ dbAdapter: database });
const endpoint = new UniverCollabEndpoint(service);
const transport = createNodeTransport();

transport.use(async (context, next) => {
  if (context.kind === "http") context.userID = "demo-user";
  await next();
});
transport.use(endpoint);

await service.createUnitFromData(
  { type: UniverType.UNIVER_SHEET, data: unitData },
  { userID: "demo-user" },
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

app.use("/universer-api", (request, response) => {
  request.url = request.originalUrl;
  transport.handleRequest(request, response);
});

app.use(express.static("dist/web"));

const server = createServer(app);
server.on("upgrade", (request, socket, head) => {
  transport.handleUpgrade(request, socket, head);
});

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3010);
server.listen(port, host, () => {
  console.info(
    `Quick Start is running at http://${host}:${port}/?unit=${UNIT_ID}&type=${UniverType.UNIVER_SHEET}`,
  );
});
