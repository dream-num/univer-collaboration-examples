import { rm } from "node:fs/promises";

// Deletes the collaboration database and the file store; the next start recreates `exchange-sheet`
// with its seed text.
await rm(".data", { recursive: true, force: true });
console.info("Removed .data");
