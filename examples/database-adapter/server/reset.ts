import { rm } from "node:fs/promises";

for (const filename of [".data/collaboration.sqlite", ".data/custom-collaboration.sqlite"]) {
  await rm(filename, { force: true });
  console.info(`Removed ${filename}`);
}
