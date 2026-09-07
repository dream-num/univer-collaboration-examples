import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import express from "express";
import { LocaleType, type IWorkbookData } from "@univerjs/core";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { CollabError, UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UnitAction, UniverType, type IAllowedRequest } from "@univerjs/protocol";
import { isAllowed, UNIT_ID, UNIT_NAME } from "./permissions";
import { currentUser, signIn, signOut, users } from "./users";

const filename = process.env.DATABASE_PATH ?? ".data/collaboration.sqlite";

const unitData: IWorkbookData = {
  id: UNIT_ID,
  rev: 1,
  name: UNIT_NAME,
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
        0: { 0: { v: "Item" }, 1: { v: "Budget" } },
        1: { 0: { v: "Design" }, 1: { v: 2400 } },
        2: { 0: { v: "Engineering" }, 1: { v: 6800 } },
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
const transport = createNodeTransport();
// Transport identifies the user; Endpoint sets the member profile.
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
endpoint.use("connect", async (context, next) => {
  const user = users.find((user) => user.userId === context.session.userID)!;
  context.member.name = user.username;
  context.member.avatar = user.avatar;
  await next();
});

// Enforce document permissions when reading and submitting changes.
service.use("readUnitData", async (context, next) => {
  if (!isAllowed(context.userID, context.request.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot read this Unit");
  await next();
});
service.use("submitChangeset", async (context, next) => {
  if (!isAllowed(context.userID, context.request.changeset.unitID, UnitAction.Edit))
    throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
  await next();
});
endpoint.use("joinUnit", async (context, next) => {
  if (!isAllowed(context.session.userID, context.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot join this Unit");
  await next();
});
transport.register(endpoint);
try {
  await service.getUnitLoadData(
    { unitID: UNIT_ID, type: UniverType.UNIVER_SHEET, revision: 0 },
    { userID: "user-editor" },
  );
} catch (error) {
  if (!(error instanceof CollabError) || error.code !== "UNIT_NOT_FOUND") throw error;
  await service.createUnitFromData(
    { type: UniverType.UNIVER_SHEET, data: unitData },
    { userID: "user-editor" },
  );
}

const app = express();
app.post("/login/:username", (request, response) => {
  const user = users.find((user) => user.username === request.params.username);
  if (!user) return void response.sendStatus(404);
  signIn(request, response, user);
  response.redirect(303, `/?unit=${UNIT_ID}&type=${UniverType.UNIVER_SHEET}`);
});
app.post("/logout", (request, response) => {
  signOut(request, response);
  response.redirect(303, "/");
});
app.get("/universer-api/demo/me", (request, response) => {
  const user = currentUser(request);
  if (!user) return void response.sendStatus(401);
  response.json(user);
});
// Univer uses these permissions to control toolbar actions and editing.
app.post("/universer-api/authz/-/object/-/batch_allowed", express.json(), (request, response) => {
  const user = currentUser(request);
  if (!user) return void response.sendStatus(401);
  const { requests } = request.body as { requests: IAllowedRequest[] };
  response.json({
    error: { code: ErrorCode.OK, message: "" },
    objectActions: requests.map((item) => ({
      unitID: item.unitID,
      objectID: item.objectID,
      actions: item.actions.map((action) => ({
        action,
        allowed: isAllowed(user.userId, item.unitID, action),
      })),
    })),
  });
});
app.use("/universer-api", (request, response) => {
  request.url = request.originalUrl;
  transport.handleRequest(request, response);
});
app.use(express.static("dist/web"));
const server = createServer(app);
server.on("upgrade", (request, socket, head) => transport.handleUpgrade(request, socket, head));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3010);
server.listen(port, host, () =>
  console.info(
    `Permissions is running at http://${host}:${port}/?unit=${UNIT_ID}&type=${UniverType.UNIVER_SHEET}`,
  ),
);
