import { createServer } from "node:http";
import { createApp } from "./app";
import { config } from "./config";

const runtime = await createApp();
const server = createServer(runtime.app);

server.on("upgrade", (request, socket, head) => {
  runtime.collaboration.transport.handleUpgrade(request, socket, head);
});
server.listen(config.port, config.host, () => {
  console.info(`All Integration Example is running at http://${config.host}:${config.port}`);
  console.info(`SQLite: ${config.databaseFilename}`);
});

let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.close(async () => {
    await runtime.dispose();
    process.exit(0);
  });
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
