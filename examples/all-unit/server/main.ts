import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import { ErrorCode, type IAllowedRequest } from "@univerjs/protocol";
import type { UnitsResponse } from "../shared/units";
import { DEMO_USER, ensureUnits, units } from "./units";

const filename = process.env.DATABASE_PATH ?? fileURLToPath(new URL("../../.data/collaboration.sqlite", import.meta.url));
await mkdir(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const service = new UniverCollabService({ dbAdapter: database });
const transport = createNodeTransport();
const endpoint = new UniverCollabEndpoint(service);
transport.use(async (context, next) => {
  context.userID = DEMO_USER.userId;
  await next();
});
endpoint.use("connect", async (context, next) => {
  context.member.name = DEMO_USER.displayName;
  await next();
});
transport.register(endpoint);

const app = express();
app.get("/api/units", (_request, response) => {
  response.json({ units, user: DEMO_USER } satisfies UnitsResponse);
});
app.post("/universer-api/authz/-/object/-/batch_allowed", express.json(), (request, response) => {
  const body = request.body as { requests?: IAllowedRequest[] };
  response.json({
    error: { code: ErrorCode.OK, message: "" },
    objectActions: (body.requests ?? []).map((item) => ({
      unitID: item.unitID,
      objectID: item.objectID,
      actions: item.actions.map((action) => ({ action, allowed: true })),
    })),
  });
});
app.use(express.static(fileURLToPath(new URL("../web", import.meta.url))));
const server = createServer(app);
transport.attach(server);

async function dispose() {
  // Transport owns Endpoint; the application disposes Service before the injected database.
  await transport.dispose();
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  await service.dispose();
  await database.dispose();
}

try {
  await ensureUnits(service);
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 3010);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  console.info(`All Unit is running at http://${host}:${port}`);
} catch (error) {
  await dispose();
  throw error;
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void dispose().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
