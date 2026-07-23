import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import { HistoryStore } from "./history-store.js";

const filename = join(
  dirname(fileURLToPath(import.meta.url)),
  "../.data/basic-sheets.sqlite"
);
mkdirSync(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const store = new HistoryStore(filename);
await store.dispose();
await database.dispose();
console.info(`Initialized ${filename}`);
