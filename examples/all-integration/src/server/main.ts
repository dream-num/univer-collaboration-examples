import { createServer } from "node:http";
import { createApp } from "./app";
import { config } from "./config";

const runtime = await createApp();
const server = createServer(runtime.app);
// Transport dispatches registered HTTP and WebSocket routes before Express.
runtime.collaboration.transport.attach(server);

async function dispose() {
  // Close realtime connections before waiting for the HTTP server to stop.
  await runtime.collaboration.transport.dispose();
  if (server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
  await runtime.dispose();
}

try {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.info(`All Integration Example is running at http://${config.host}:${port}`);
  console.info(`SQLite: ${config.databaseFilename}`);
} catch (error) {
  await dispose();
  throw error;
}

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    void dispose().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}
