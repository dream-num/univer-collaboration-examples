import { createServer, type IncomingMessage } from "node:http";
import express from "express";
import { LocaleType, type IWorkbookData } from "@univerjs/core";
import { MemoryDatabaseAdapter } from "@univerjs-pro/collaboration-database-memory";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import {
  CollabError,
  UniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";

const UNIT_ID = "permissions-sheet";
const users = {
  editor: { userId: "user-editor", username: "editor", role: "editor" },
  viewer: { userId: "user-viewer", username: "viewer", role: "viewer" },
} as const;
type DemoUser = (typeof users)[keyof typeof users];

function currentUser(request: IncomingMessage): DemoUser | undefined {
  const name = request.headers.cookie?.match(
    /(?:^|;\s*)demo_user=(editor|viewer)(?:;|$)/u,
  )?.[1] as keyof typeof users | undefined;
  return name ? users[name] : undefined;
}
function canRead(userID: string) {
  return userID === users.editor.userId || userID === users.viewer.userId;
}
function canEdit(userID: string) {
  return userID === users.editor.userId;
}

const unitData: IWorkbookData = {
  id: UNIT_ID,
  rev: 1,
  name: "Permissions Sheet",
  appVersion: "",
  locale: LocaleType.EN_US,
  sheetOrder: ["sheet-1"],
  sheets: {
    "sheet-1": {
      id: "sheet-1",
      name: "Sheet 1",
      rowCount: 100,
      columnCount: 26,
      cellData: { 0: { 0: { v: "Try editor and viewer" } } },
    },
  },
  styles: {},
  resources: [],
};

const database = new MemoryDatabaseAdapter();
const service = new UniverCollabService({ dbAdapter: database });
const endpoint = new UniverCollabEndpoint(service);
const transport = createNodeTransport();
service.use("readUnitData", async (context, next) => {
  if (!canRead(context.userID))
    throw new CollabError("PERMISSION_DENIED", "Cannot read this Unit");
  await next();
});
service.use("submitChangeset", async (context, next) => {
  if (!canEdit(context.userID))
    throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
  await next();
});
service.use("applyChangeset", async (context, next) => {
  if (!canEdit(context.userID))
    throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
  await next();
});
endpoint.use("joinUnit", async (context, next) => {
  if (!canRead(context.session.userID))
    throw new CollabError("PERMISSION_DENIED", "Cannot join this Unit");
  await next();
});
transport.use(async (context, next) => {
  const user = currentUser(context.incomingMessage);
  if (!user) {
    context.response.statusCode = 401;
    context.response.end("Sign in first");
    return;
  }
  context.userID = user.userId;
  await next();
});
transport.register(endpoint);
await service.createUnitFromData(
  { type: UniverType.UNIVER_SHEET, data: unitData },
  { userID: users.editor.userId },
);

const app = express();
app.get("/login/:username", (request, response) => {
  if (
    request.params.username !== "editor" &&
    request.params.username !== "viewer"
  )
    return void response.sendStatus(404);
  response.setHeader(
    "Set-Cookie",
    `demo_user=${request.params.username}; Path=/; HttpOnly; SameSite=Lax`,
  );
  response.redirect(`/?unit=${UNIT_ID}&type=${UniverType.UNIVER_SHEET}`);
});
app.get("/universer-api/demo/me", (request, response) => {
  const user = currentUser(request);
  user
    ? response.json({ username: user.username, role: user.role })
    : response.sendStatus(401);
});
app.post(
  "/universer-api/authz/-/object/-/batch_allowed",
  express.json(),
  (request, response) => {
    const user = currentUser(request);
    if (!user) return void response.sendStatus(401);
    const body = request.body as {
      requests: Array<{ unitID: string; objectID: string; actions: unknown[] }>;
    };
    response.json({
      error: { code: ErrorCode.OK, message: "" },
      objectActions: body.requests.map((item) => ({
        unitID: item.unitID,
        objectID: item.objectID,
        actions: item.actions.map((action) => ({
          action,
          allowed: canEdit(user.userId),
        })),
      })),
    });
  },
);
app.get("/", (request, response, next) => {
  if (!currentUser(request)) return void response.redirect("/login/editor");
  next();
});
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
    `Permissions is running at http://${host}:${port}/?unit=${UNIT_ID}&type=${UniverType.UNIVER_SHEET}`,
  ),
);
