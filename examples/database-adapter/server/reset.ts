import { rm } from "node:fs/promises";

await rm(".data/collaboration.sqlite", { force: true });
console.info("Removed .data/collaboration.sqlite");
