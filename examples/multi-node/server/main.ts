import { createServer } from "node:http";
import express from "express";
import { Pool } from "pg";
import { createClient } from "redis";
import { RedisPubSubAdapter, RedisSessionTicketStore } from "@univerjs-pro/collaboration-cluster-redis";
import { PostgresDatabaseAdapter } from "@univerjs-pro/collaboration-database-postgres";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode } from "@univerjs/protocol";
import { UnitRepository } from "./unit-repository.js";
import { createUnitRouter } from "./unit-routes.js";
import { UnitService } from "./unit-service.js";

const USER_ID = "demo-user";
const NODE_ID = process.env.NODE_ID ?? "node-a";
const databaseURL = process.env.DATABASE_URL ?? "postgres://univer:univer@127.0.0.1:5432/collaboration";
const redisURL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

// Both nodes share one PostgreSQL database through the PostgreSQL Adapter.
// schema.sql provisions the tables; the Adapter only verifies the schema version on startup.
const pool = new Pool({ connectionString: databaseURL });
pool.on("error", (error) => console.error(`[${NODE_ID}] postgres idle connection error: ${error.message}`));
await requireDatabaseSchema();
const database = await PostgresDatabaseAdapter.create({ pool });
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
const units = new UnitService(service, new UnitRepository(pool));
app.use("/api/units", createUnitRouter(units, USER_ID, NODE_ID));
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
  // The Adapter never ends the pool it was given; the application owns it and the catalog queries.
  await pool.end();
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
