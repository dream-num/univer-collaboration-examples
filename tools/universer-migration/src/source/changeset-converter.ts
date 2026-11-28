// Converts Universer changeset rows to SDK `ChangesetRecord`s. Pure functions.
import type { ChangesetRecord } from "@univerjs-pro/collaboration-service";
import type { IMutation, UniverType } from "@univerjs/protocol";
import type { SourceChangeset } from "../model.js";
import type { ChangesetRow } from "./universer-database.js";

export function toSourceChangeset(unitID: string, type: UniverType, row: ChangesetRow): SourceChangeset {
  return { record: toChangesetRecord(unitID, type, row), createdAtMs: row.createdAtMs };
}

/**
 * Universer stores the client's original `base_rev`, which lags behind `revision - 1` after
 * concurrent edits, while the stored mutations are already transformed to `revision - 1`. The SDK
 * requires confirmed changesets to chain (`baseRev = revision - 1`), so the base is rewritten.
 *
 * Server-written changesets (for example a rename through UpdateUnit) carry `sid = ''` and
 * `req_id = 1`; the SDK keeps `(unit, sid, reqId)` unique, so each gets a per-revision `sid`.
 *
 * Universer does not store `memberID`; it identifies a live connection and is written as `''`.
 */
export function toChangesetRecord(unitID: string, type: UniverType, row: ChangesetRow): ChangesetRecord {
  const sid = row.sid || `universer-server-${row.revision}`;
  return {
    unitID,
    type,
    baseRev: row.revision - 1,
    revision: row.revision,
    userID: row.userID,
    memberID: "",
    mutations: toMutations(row),
    sid,
    reqId: row.reqID >= 1 ? row.reqID : 1,
    createTime: Math.floor(row.createdAtMs / 1000),
    metadata: {},
  };
}

/** Checks that revisions run from `firstRevision` without gaps or duplicates. */
export function assertContiguous(changesets: readonly ChangesetRow[], firstRevision: number): void {
  changesets.forEach((row, index) => {
    if (row.revision !== firstRevision + index) {
      throw new Error(`Changesets are not contiguous: expected revision ${firstRevision + index}, found ${row.revision}`);
    }
  });
}

function toMutations(row: ChangesetRow): IMutation[] {
  if (!Array.isArray(row.mutations)) throw new Error(`Changeset ${row.revision} has no mutation array`);
  return row.mutations.map((mutation, index) => {
    const { id, data } = (mutation ?? {}) as { id?: unknown; data?: unknown };
    // `data` is the serialized params string; it is kept as a string, never parsed.
    if (typeof id !== "string" || typeof data !== "string") {
      throw new Error(`Changeset ${row.revision} mutation ${index} is not { id, data } strings`);
    }
    return { id, data };
  });
}
