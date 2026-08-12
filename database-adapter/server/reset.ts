import { rm } from "node:fs/promises";
const filename = ".data/collaboration.sqlite";
await rm(filename, { force: true });
console.info(`Removed ${filename}`);
