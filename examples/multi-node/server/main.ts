import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import { Pool } from "pg";
import { createClient } from "redis";
import { RedisPubSubAdapter, RedisSessionTicketStore } from "@univerjs-pro/collaboration-cluster-redis";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import { CustomPostgresDatabaseAdapter } from "./postgres-database-adapter.js";
import { createUnitData } from "./unit-data.js";

const USER_ID = "demo-user";
const NODE_ID = process.env.NODE_ID ?? "node-a";
const databaseURL = process.env.DATABASE_URL ?? "postgres://univer:univer@127.0.0.1:5432/collaboration";
const redisURL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

// Both nodes use the same PostgreSQL database through the database adapter.
// The schema comes from schema.sql, applied when the database is provisioned; nodes never run DDL.
const pool = new Pool({ connectionString: databaseURL });
pool.on("error", (error) => console.error(`[${NODE_ID}] postgres idle connection error: ${error.message}`));
await requireDatabaseSchema();
const database = new CustomPostgresDatabaseAdapter(pool);
const service = new UniverCollabService({ dbAdapter: database });

// Share real-time delivery and session tickets through Redis so any node can serve any request.
const redis = createClient({ url: redisURL });
const redisSubscriber = redis.duplicate();
for (const client of [redis, redisSubscriber]) {
  client.on("error", (error) => console.error(`[${NODE_ID}] redis error: ${error.message}`));
}
await Promise.all([redis.connect(), redisSubscriber.connect()]);
const pubSub = new RedisPubSubAdapter({ pubClient: redis, subClient: redisSubscriber });
const ticketStore = new RedisSessionTicketStore({ client: redis });

const endpoint = new UniverCollabEndpoint(service, { pubSub, ticketStore });
// Log each change of this node's status against the License's node limit.
endpoint.license.on("nodesStatusChanged", ({ status, previousStatus, limit, reason }) => {
  console.warn(`[${NODE_ID}] license.nodes ${previousStatus} -> ${status} limit=${limit}${reason ? ` reason=${reason}` : ""}`);
});
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
app.get("/api/files", async (_request, response) => {
  const { rows: files } = await pool.query<{ unitID: string; name: string }>(
    'SELECT unit_id AS "unitID", name FROM files ORDER BY created_at DESC, unit_id',
  );
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
  await pool.query("INSERT INTO files (unit_id, name, created_at) VALUES ($1, $2, $3)", [unitID, data.name, Date.now()]);
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
  // The Endpoint does not dispose the pub/sub adapter or the Redis clients it was given.
  await pubSub.dispose();
  await Promise.all([redis.close(), redisSubscriber.close()]);
  await service.dispose();
  // The adapter owns the pool and closes it, which also closes the catalog connections.
  await database.dispose();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown().catch(() => {
    process.exitCode = 1;
  }));
}

/** Fails fast when schema.sql has not been applied, instead of surfacing "relation does not exist" on the first request. */
async function requireDatabaseSchema() {
  const { rows } = await pool.query<{ exists: string | null }>("SELECT to_regclass('collaboration.units') AS exists");
  if (!rows[0]?.exists) {
    await pool.end();
    throw new Error("Database schema is missing. Apply examples/multi-node/schema.sql first.");
  }
}
