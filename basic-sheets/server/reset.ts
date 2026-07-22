import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const filename = join(
  dirname(fileURLToPath(import.meta.url)),
  "../.data/basic-sheets.sqlite"
);
for (const path of [filename, `${filename}-wal`, `${filename}-shm`]) {
  await rm(path, { force: true });
}
console.info(`Reset ${filename}`);
