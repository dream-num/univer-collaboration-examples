import { rm } from "node:fs/promises";

// Deletes the trunk Unit and the Worktree record; the next start recreates `demo-worktree` in draft.
await rm(".data", { recursive: true, force: true });
console.info("Removed .data");
