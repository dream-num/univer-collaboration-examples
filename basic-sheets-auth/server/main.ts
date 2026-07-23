import { createBasicSheetsAuthApplication } from "./application.js";

const port = Number(process.env.PORT ?? 3010);
const host = process.env.HOST ?? "127.0.0.1";
const application = await createBasicSheetsAuthApplication(
  process.env.AUTH_SECRET ? { jwtSecret: process.env.AUTH_SECRET } : {}
);
const actualPort = await application.listen(port, host);

console.info(`Basic Sheets Auth is running at http://${host}:${actualPort}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void application.close().finally(() => process.exit(0));
  });
}
