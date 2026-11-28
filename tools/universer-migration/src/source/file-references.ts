// Finds the Universer files a Unit refers to, so their metadata can be registered with the SDK file
// service. Pure functions over protocol objects.
import type { ChangesetRecord } from "@univerjs-pro/collaboration-service";
import type { ISnapshot } from "@univerjs/protocol";

/**
 * Collects file IDs from:
 * - drawing objects with `imageSourceType: "UUID"`, whose `source` is a Universer file ID (images
 *   inserted by Office import), in snapshot resources and in changeset mutation params;
 * - PDF metadata fields ending in `FileId` (source PDF, model JSON and assets).
 */
export function collectFileIDs(snapshots: readonly ISnapshot[], changesets: readonly ChangesetRecord[]): string[] {
  const ids = new Set<string>();
  for (const snapshot of snapshots) {
    const meta = snapshot.workbook ?? snapshot.doc ?? snapshot.slide ?? snapshot.board;
    for (const resource of meta?.resources ?? []) collectFromJsonText(resource.data, ids);
    if (snapshot.pdf) walk(snapshot.pdf, ids);
  }
  for (const changeset of changesets) {
    for (const mutation of changeset.mutations) collectFromJsonText(mutation.data, ids);
  }
  return [...ids].sort();
}

function collectFromJsonText(text: string, ids: Set<string>): void {
  // Cheap pre-check: most resources and mutations reference no file.
  if (!text.includes("UUID") && !text.includes("FileId")) return;
  try {
    walk(JSON.parse(text), ids);
  } catch {
    // Not JSON (for example an empty resource); nothing to collect.
  }
}

function walk(value: unknown, ids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, ids);
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (object["imageSourceType"] === "UUID" && typeof object["source"] === "string" && object["source"]) {
    ids.add(object["source"]);
  }
  for (const [key, child] of Object.entries(object)) {
    if (key.endsWith("FileId") && typeof child === "string" && child) ids.add(child);
    else if (typeof child === "object") walk(child, ids);
  }
}
