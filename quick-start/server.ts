import { createRequire } from "node:module";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IWorkbookData } from "@univerjs/core";
import express from "express";

const sdkRequire = createRequire(import.meta.url);
const { LocaleType } = sdkRequire("@univerjs/core") as typeof import("@univerjs/core");
const { MemoryDatabaseAdapter } = sdkRequire(
  "@univerjs-pro/collaboration-database-memory"
) as typeof import("@univerjs-pro/collaboration-database-memory");
const { UniverCollabEndpoint } = sdkRequire(
  "@univerjs-pro/collaboration-endpoint"
) as typeof import("@univerjs-pro/collaboration-endpoint");
const { UniverCollabService } = sdkRequire(
  "@univerjs-pro/collaboration-service"
) as typeof import("@univerjs-pro/collaboration-service");
const { createNodeTransport } = sdkRequire(
  "@univerjs-pro/collaboration-transport-node"
) as typeof import("@univerjs-pro/collaboration-transport-node");
const { ErrorCode, UniverType } = sdkRequire(
  "@univerjs/protocol"
) as typeof import("@univerjs/protocol");
const userID = "demo-user";
const unitID = "quick-start-sheet";
const ok = { code: ErrorCode.OK, message: "" };

const database = new MemoryDatabaseAdapter();
const service = new UniverCollabService({ dbAdapter: database });
await service.createUnitFromData(
  {
    type: UniverType.UNIVER_SHEET,
    data: {
      id: unitID,
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
    } satisfies IWorkbookData,
  },
  { userID }
);

const endpoint = new UniverCollabEndpoint(service);
const transport = createNodeTransport();
transport.use(async (context, next) => {
  if (context.kind === "http") context.userID = userID;
  await next();
});
transport.use(endpoint);

const app = express();
app.get("/", (request, response, next) => {
  if (request.query.unit) {
    next();
    return;
  }
  response.redirect(`/?unit=${unitID}&type=${UniverType.UNIVER_SHEET}`);
});
app.post(
  "/universer-api/authz/-/object/-/batch_allowed",
  express.json(),
  (request, response) => {
    const body = request.body as {
      readonly requests: readonly {
        readonly unitID: string;
        readonly objectID: string;
        readonly actions: readonly unknown[];
      }[];
    };
    response.json({
      error: ok,
      objectActions: body.requests.map((item) => ({
        unitID: item.unitID,
        objectID: item.objectID,
        actions: item.actions.map((action) => ({ action, allowed: true })),
      })),
    });
  }
);
app.use("/universer-api", (request, response) => {
  request.url = request.originalUrl;
  transport.handleRequest(request, response);
});

const clientDirectory = join(dirname(fileURLToPath(import.meta.url)), "dist/client");
app.use(express.static(clientDirectory));
app.use((_request, response) => {
  response.sendFile(join(clientDirectory, "index.html"));
});

const server = createServer(app);
server.on("upgrade", (request, socket, head) => {
  transport.handleUpgrade(request, socket, head);
});

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 3010);
server.listen(port, host, () => {
  console.info(`Quick Start is running at http://${host}:${port}`);
});
