import { createServer } from "node:http";
import { hostname } from "node:os";
import express from "express";
import { Pool } from "pg";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { requireDatabaseSchema } from "./database-schema.js";
import { createExchangeRouter } from "./exchange.js";
import { PostgresExchangeStore } from "./exchange-store.js";
import { CustomPostgresDatabaseAdapter } from "./postgres-database-adapter.js";

// The import/export (exchange) service: a second entry point of this example that runs as its
// own deployment with its own replica count. It holds no Endpoint, Transport, or Redis: it only
// reads and writes Units through the collaboration Service on the shared database.
const USER_ID = "demo-user";
const INSTANCE_ID = process.env.HOSTNAME ?? hostname();
const databaseURL = process.env.DATABASE_URL ?? "postgres://univer:univer@127.0.0.1:5432/collaboration";

const pool = new Pool({ connectionString: databaseURL });
pool.on("error", (error) => console.error(`[exchange ${INSTANCE_ID}] postgres idle connection error: ${error.message}`));
await requireDatabaseSchema(pool, ["collaboration.units", "files", "exchange_tasks", "exchange_files"]);
const database = new CustomPostgresDatabaseAdapter(pool);
const service = new UniverCollabService({ dbAdapter: database });

const exchange = createExchangeRouter({
  service,
  store: new PostgresExchangeStore(pool),
  userID: USER_ID,
  instanceID: INSTANCE_ID,
  onUnitImported: async (unitID, name) => {
    // Add the imported Unit to the file catalog so the sidebar lists it on every node.
    await pool.query("INSERT INTO files (unit_id, name, created_at) VALUES ($1, $2, $3)", [unitID, name, Date.now()]);
    console.info(`[exchange ${INSTANCE_ID}] file.imported unitID=${unitID}`);
  },
});

const app = express();
app.use((request, response, next) => {
  // Expose the replica that handled the request so the distribution is observable from the browser.
  response.setHeader("X-Exchange-Instance", INSTANCE_ID);
  response.once("finish", () => {
    console.info(`[exchange ${INSTANCE_ID}] ${request.method} ${request.path} status=${response.statusCode}`);
  });
  next();
});
app.get("/healthz", (_request, response) => response.json({ service: "exchange", instance: INSTANCE_ID }));
app.use("/universer-api", exchange.router);
const server = createServer(app);
server.listen(Number(process.env.PORT ?? 3011), process.env.HOST ?? "127.0.0.1");

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  // Let conversions that already started write their outcome; clients keep polling through other replicas.
  await exchange.waitForTasks();
  await service.dispose();
  // The adapter owns the pool and closes it, which also closes the exchange store connections.
  await database.dispose();
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown().catch(() => {
    process.exitCode = 1;
  }));
}
