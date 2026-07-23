import { createSuiteApplication } from "./application.js";

const port = Number(process.env.PORT ?? 3020);
const host = process.env.HOST ?? "127.0.0.1";
const application = await createSuiteApplication();
const actualPort = await application.listen(port, host);

console.info(`Univer Suite Demo is running at http://${host}:${actualPort}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void application.close().finally(() => process.exit(0));
  });
}
