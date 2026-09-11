import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import express from "express";
import Database from "libsql";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import { createUnitData } from "./unit-data.js";

const USER_ID = "demo-user";
const NODE_ID = process.env.NODE_ID ?? "node-a";
const filename = process.env.DATABASE_PATH ?? ".data/collaboration.sqlite";

await mkdir(dirname(filename), { recursive: true });
// Both nodes use the same persistent database through the database adapter.
const database = new SQLiteDatabaseAdapter({ filename });
const service = new UniverCollabService({ dbAdapter: database });
// Store the application catalog alongside the adapter's collaboration_* tables.
const catalog = new Database(filename);
catalog.exec(`
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS files (
    unit_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const endpoint = new UniverCollabEndpoint(service);
const transport = createNodeTransport();
transport.use(async (context, next) => {
  // Use a fixed identity for this demo; production applications should authenticate here.
  context.userID = USER_ID;
  context.response.setHeader("X-Collab-Node", NODE_ID);
  // Log one line per request using the route template to omit ticket query values.
  context.response.once("finish", () => {
    console.info(`[${NODE_ID}] ${context.incomingMessage.method} ${context.route?.path} unitID=${context.params.unitID ?? "-"} status=${context.response.statusCode}`);
  });
  await next();
});
transport.register(endpoint);

const app = express();
app.get("/healthz", (_request, response) => response.json({ node: NODE_ID }));
app.get("/api/files", (_request, response) => {
  const files = catalog.prepare(
    "SELECT unit_id AS unitID, name FROM files ORDER BY created_at DESC, unit_id",
  ).all();
  response.json({ files });
});
app.post("/api/files", express.json({ limit: "4kb" }), async (request, response) => {
  const name: unknown = request.body?.name;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
    response.status(400).json({ error: "Enter a file name between 1 and 80 characters." });
    return;
  }
  // Assign a new ID for each creation so nodes can concurrently create files with the same name.
  const unitID = randomUUID();
  const data = createUnitData(unitID, name.trim());
  const result = await service.createUnitFromData({ type: UniverType.UNIVER_SHEET, data }, { userID: USER_ID });
  if (result.status !== "created") {
    response.status(409).json({ error: "Could not allocate a new file ID. Please try again." });
    return;
  }
  // Add the file to the application catalog only after the Unit is created.
  catalog.prepare("INSERT INTO files (unit_id, name, created_at) VALUES (?, ?, ?)")
    .run(unitID, data.name, Date.now());
  console.info(`[${NODE_ID}] file.created unitID=${unitID}`);
  response.setHeader("X-Collab-Node", NODE_ID);
  response.status(201).json({ unitID, name: data.name });
});
// Use the collaboration hash rule so the UI can display the document's assigned node.
app.get("/api/node", (_request, response) => response.json({ node: NODE_ID }));
app.post("/universer-api/authz/-/object/-/batch_allowed", express.json(), (request, response) => {
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
});
app.use(express.static("dist/web"));
const server = createServer(app);
transport.attach(server);
server.listen(Number(process.env.PORT ?? 3010), process.env.HOST ?? "127.0.0.1");

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await transport.dispose();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await service.dispose();
  await database.dispose();
  catalog.close();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown().catch(() => {
    process.exitCode = 1;
  }));
}
