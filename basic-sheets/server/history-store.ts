import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { IChangeset } from "@univerjs/protocol";

export interface HistoryEntry {
  readonly unitID: string;
  readonly revision: number;
  readonly userId: string;
  readonly commands: readonly string[];
  readonly createdAt: number;
  readonly restoredRevision?: number;
}

interface HistoryRow {
  readonly unit_id: string;
  readonly revision: number;
  readonly user_id: string;
  readonly commands_json: string;
  readonly created_at: number;
  readonly restored_revision: number | null;
}

/** Edit History UI 所需的最小展示索引，不参与协同数据正确性。 */
export class HistoryStore {
  private readonly _database: DatabaseSync;
  private _disposed = false;

  constructor(filename: string) {
    this._database = new DatabaseSync(filename);
    this._database.exec("PRAGMA busy_timeout = 5000;");
    this._database.exec("PRAGMA journal_mode = WAL;");
    this._database.exec(
      readFileSync(new URL("./schema.sql", import.meta.url), "utf8")
    );
  }

  recordInitialHistory(unitID: string, userId: string): void {
    this._record({
      unitID,
      revision: 1,
      userId,
      commands: ["univer.mutation.create-unit"],
      createdAt: Date.now(),
    });
  }

  recordChangeset(changeset: IChangeset): void {
    const restoredRevision = readRestoredRevision(changeset);
    this._record({
      unitID: changeset.unitID,
      revision: changeset.revision,
      userId: changeset.userID,
      commands: changeset.mutations.map((mutation) => mutation.id),
      createdAt: Date.now(),
      ...(restoredRevision === undefined ? {} : { restoredRevision }),
    });
  }

  listHistory(
    unitID: string,
    options: {
      readonly length: number;
      readonly beforeRevision?: number;
      readonly userIds?: readonly string[];
    }
  ): { readonly entries: readonly HistoryEntry[]; readonly hasMore: boolean } {
    this._assertOpen();
    const userIds = [...new Set(options.userIds ?? [])];
    const userFilter = userIds.length
      ? ` AND user_id IN (${userIds.map(() => "?").join(", ")})`
      : "";
    const rows = this._database
      .prepare(
        `SELECT unit_id, revision, user_id, commands_json, created_at,
                restored_revision
         FROM example_history
         WHERE unit_id = ? AND revision < ?
         ${userFilter}
         ORDER BY revision DESC
         LIMIT ?`
      )
      .all(
        unitID,
        options.beforeRevision ?? Number.MAX_SAFE_INTEGER,
        ...userIds,
        options.length + 1
      ) as unknown as HistoryRow[];
    return {
      entries: rows.slice(0, options.length).map(rowToHistory),
      hasMore: rows.length > options.length,
    };
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    this._database.close();
  }

  private _record(entry: HistoryEntry): void {
    this._assertOpen();
    this._database
      .prepare(
        `INSERT INTO example_history
           (unit_id, revision, user_id, commands_json, created_at,
            restored_revision)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(unit_id, revision) DO NOTHING`
      )
      .run(
        entry.unitID,
        entry.revision,
        entry.userId,
        JSON.stringify(entry.commands),
        entry.createdAt,
        entry.restoredRevision ?? null
      );
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error("History store is disposed");
  }
}

function rowToHistory(row: HistoryRow): HistoryEntry {
  return {
    unitID: row.unit_id,
    revision: row.revision,
    userId: row.user_id,
    commands: JSON.parse(row.commands_json) as string[],
    createdAt: row.created_at,
    ...(row.restored_revision === null
      ? {}
      : { restoredRevision: row.restored_revision }),
  };
}

function readRestoredRevision(changeset: IChangeset): number | undefined {
  const mutation = changeset.mutations.find(
    (candidate) => candidate.id === "univer.mutation.revert-version"
  );
  if (!mutation) return undefined;
  try {
    const params = JSON.parse(mutation.data) as { revision?: unknown };
    return Number.isSafeInteger(params.revision)
      ? (params.revision as number)
      : undefined;
  } catch {
    return undefined;
  }
}
