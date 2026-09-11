import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import express from "express";
import { LocaleType, type IWorkbookData } from "@univerjs/core";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import {
  MemorySessionTicketStore,
  UniverCollabEndpoint,
} from "@univerjs-pro/collaboration-endpoint";
import {
  CollabError,
  UniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { SQLiteWorktreeDatabaseAdapter } from "@univerjs-pro/collaboration-worktree-database-sqlite";
import { UniverCollabWorktreeEndpoint } from "@univerjs-pro/collaboration-worktree-endpoint";
import {
  UniverCollabWorktreeService,
  WorktreeError,
} from "@univerjs-pro/collaboration-worktree-service";
import { ErrorCode, UniverType } from "@univerjs/protocol";

const USER_ID = `User-${randomUUID().slice(0, 4)}`;
const UNIT_ID = "worktree-sheet";
const WORKTREE_ID = "demo-worktree";
const filename = ".data/collaboration.sqlite";
const unitData: IWorkbookData = {
  id: UNIT_ID,
  rev: 1,
  name: "Worktree Sheet",
  appVersion: "",
  locale: LocaleType.EN_US,
  sheetOrder: ["sheet-1"],
  sheets: {
    "sheet-1": {
      id: "sheet-1",
      name: "Sheet 1",
      rowCount: 100,
      columnCount: 26,
      cellData: { 0: { 0: { v: "Edit in draft, then merge" } } },
    },
  },
  styles: {},
  resources: [],
};

await mkdir(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const service = new UniverCollabService({ dbAdapter: database });
const worktreeDatabase = new SQLiteWorktreeDatabaseAdapter({ filename });
const worktreeService = new UniverCollabWorktreeService({
  trunk: { service, dbAdapter: database },
  dbAdapter: worktreeDatabase,
});
const ticketStore = new MemorySessionTicketStore();
const endpoint = new UniverCollabEndpoint(service, { ticketStore });
const worktreeEndpoint = new UniverCollabWorktreeEndpoint(worktreeService, {
  ticketStore,
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
worktreeEndpoint.use("connect", async (context, next) => {
  context.member.name = context.session.userID;
  await next();
});
transport.register(endpoint);
transport.register(worktreeEndpoint);

try {
  await service.getUnitLoadData(
    { unitID: UNIT_ID, type: UniverType.UNIVER_SHEET, revision: 0 },
    { userID: USER_ID },
  );
} catch (error) {
  if (!(error instanceof CollabError) || error.code !== "UNIT_NOT_FOUND")
    throw error;
  await service.createUnitFromData(
    { type: UniverType.UNIVER_SHEET, data: unitData },
    { userID: USER_ID },
  );
}
try {
  await worktreeService.getWorktree(
    { worktreeID: WORKTREE_ID },
    { userID: USER_ID },
  );
} catch (error) {
  if (
    !(error instanceof WorktreeError) ||
    error.code !== "WORKTREE_NOT_FOUND"
  )
    throw error;
  await worktreeService.createWorktree(
    { worktreeID: WORKTREE_ID, units: [UNIT_ID] },
    { userID: USER_ID },
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
app.use(express.static("dist/web"));
const server = createServer(app);
transport.attach(server);
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3010);
server.listen(port, host, () =>
  console.info(
    `Worktree is running at http://${host}:${port}/?unit=${UNIT_ID}&type=${UniverType.UNIVER_SHEET}&worktree=${WORKTREE_ID}`,
  ),
);
