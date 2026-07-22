import { createDemoApplication } from "./express-server.js";

const port = Number(process.env.PORT ?? 3010);
const host = process.env.HOST ?? "127.0.0.1";
const application = await createDemoApplication();
await application.listen(port, host);
console.info(`Univer collaboration demo: http://localhost:${port}`);

const shutdown = async (): Promise<void> => {
  await application.close();
  process.exitCode = 0;
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
