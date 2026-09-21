import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import express from "express";
import Database from "libsql";
import { LocaleType, type IWorkbookData } from "@univerjs/core";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { CollabError, UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { UnitAction, UniverType } from "@univerjs/protocol";
import { AuthzError, createAclStore, initializeAclSchema, isObjectActionAllowed } from "./acl";
import { createAuthzRouter } from "./authz";
import { isUnitActionAllowed, UNIT_ID, UNIT_NAME } from "./permissions";
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
// Turn on permission analysis: the Service then resolves which UnitObject + UnitAction
// each incoming mutation needs and exposes them to the applyChangeset middleware.
// With the flag off, requiredUnitPermissions is always an empty array — and an empty
// array never means "allowed".
const service = new UniverCollabService({ dbAdapter: database, enableUnitPermissionAnalysis: true });
const endpoint = new UniverCollabEndpoint(service);
const transport = createNodeTransport();

// The ACL lives in the application's own database, next to the collaboration data.
const aclDatabase = new Database(filename);
aclDatabase.pragma("foreign_keys = ON");
initializeAclSchema(aclDatabase);
const acl = createAclStore(aclDatabase);

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

// Unit-level gates: who may read or edit the document at all.
service.use("readUnitData", async (context, next) => {
  if (!isUnitActionAllowed(context.userID, context.request.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot read this Unit");
  await next();
});
service.use("submitChangeset", async (context, next) => {
  if (!isUnitActionAllowed(context.userID, context.request.changeset.unitID, UnitAction.Edit))
    throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
  await next();
});
endpoint.use("joinUnit", async (context, next) => {
  if (!isUnitActionAllowed(context.session.userID, context.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot join this Unit");
  await next();
});

// Object-level enforcement: applyChangeset runs after OT transform and before the
// mutation lands, with the resolved requirements of every mutation in the batch.
// Requirements are AND-ed — a single denial rejects the whole changeset.
// For Worksheet and SelectRange the objectID is the protection rule's permissionId,
// not a worksheet ID or range address; the Service has already validated the binding.
service.use("applyChangeset", async (context, next) => {
  for (const requirement of context.requiredUnitPermissions) {
    const granted = isObjectActionAllowed(acl, context.userID, {
      unitID: requirement.unitID,
      objectID: requirement.objectID,
      objectType: requirement.objectType,
      action: requirement.action,
    });
    if (!granted) {
      throw new CollabError(
        "PERMISSION_DENIED",
        `Mutation ${requirement.mutationID} needs ${UnitAction[requirement.action]} on the protected object`,
      );
    }
  }
  await next();
});

// After a commit, an application can activate pending permission objects or mark
// deleted ones using event.requiredUnitPermissions. Never garbage-collect an ACL from
// a single commit: undo/redo and history restore can reference the permissionId again.
service.on("changesetCommitted", (event) => {
  if (event.requiredUnitPermissions.length > 0) {
    console.info(
      `Committed changeset r${event.changeset.revision} touching ${event.requiredUnitPermissions.length} protected object(s)`,
    );
  }
});

transport.register(endpoint);
try {
  await service.getUnitLoadData(
    { unitID: UNIT_ID, type: UniverType.UNIVER_SHEET, revision: 0 },
    { userID: "user-alice" },
  );
} catch (error) {
  if (!(error instanceof CollabError) || error.code !== "UNIT_NOT_FOUND") throw error;
  await service.createUnitFromData(
    { type: UniverType.UNIVER_SHEET, data: unitData },
    { userID: "user-alice" },
  );
}

function requireUser(request: express.Request, response: express.Response) {
  const user = currentUser(request);
  if (!user) {
    response.sendStatus(401);
    return undefined;
  }
  return user;
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
// The client permission panel talks to these routes through the configured authzUrl.
app.use(
  "/universer-api/authz",
  express.json({ limit: "64kb" }),
  createAuthzRouter({ store: acl, requireUser }),
);
app.use(
  (error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof AuthzError) {
      response.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    console.error(error);
    response.status(500).json({ code: "INTERNAL_ERROR" });
  },
);
app.use(express.static("dist/web"));
const server = createServer(app);
transport.attach(server);
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3010);
server.listen(port, host, () =>
  console.info(
    `Object Permissions is running at http://${host}:${port}/?unit=${UNIT_ID}&type=${UniverType.UNIVER_SHEET}`,
  ),
);
