import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { SQLiteHistoryDatabaseAdapter } from "@univerjs-pro/collaboration-history-database-sqlite";

const filename = join(
  dirname(fileURLToPath(import.meta.url)),
  "../.data/basic-sheets.sqlite"
);
mkdirSync(dirname(filename), { recursive: true });
const database = new SQLiteDatabaseAdapter({ filename });
const historyDbAdapter = new SQLiteHistoryDatabaseAdapter({ filename });
await historyDbAdapter.dispose();
await database.dispose();
console.info(`Initialized ${filename}`);
