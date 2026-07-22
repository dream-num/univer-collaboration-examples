import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import { DemoStore } from "./demo-store.js";

const filename = join(
  dirname(fileURLToPath(import.meta.url)),
  "../.data/basic-sheets.sqlite"
);
mkdirSync(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const store = new DemoStore(filename);
store.getOrCreateCookieSecret();
await store.dispose();
await database.dispose();
console.info(`Initialized ${filename}`);
