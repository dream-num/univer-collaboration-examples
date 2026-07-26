import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SQLiteDatabaseAdapter } from "@univerjs/collaboration-database-sqlite";
import { SQLiteHistoryDatabaseAdapter } from "@univerjs/collaboration-history-database-sqlite";
import { ApplicationStore } from "./store.js";

const filename = join(
  dirname(fileURLToPath(import.meta.url)),
  "../.data/basic-sheets-auth.sqlite"
);
mkdirSync(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const historyDbAdapter = new SQLiteHistoryDatabaseAdapter({ filename });
const store = new ApplicationStore(filename);
await store.ensurePresetUsers();
store.dispose();
await historyDbAdapter.dispose();
await database.dispose();
console.info(`Initialized ${filename}`);
