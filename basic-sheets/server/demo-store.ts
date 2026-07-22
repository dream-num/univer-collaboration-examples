import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { IChangeset } from "@univerjs/protocol";

export interface Guest {
  readonly guestId: string;
  readonly name: string;
  readonly createdAt: number;
}

export interface HistoryEntry {
  readonly unitID: string;
  readonly revision: number;
  readonly userId: string;
  readonly commands: readonly string[];
  readonly createdAt: number;
  readonly restoredRevision?: number;
}

interface GuestRow {
  readonly guest_id: string;
  readonly display_name: string;
  readonly created_at: number;
}

interface SettingRow {
  readonly value: string;
}

interface HistoryRow {
  readonly unit_id: string;
  readonly revision: number;
  readonly user_id: string;
  readonly commands_json: string;
  readonly created_at: number;
  readonly restored_revision: number | null;
}

export class DemoStore {
  private readonly _database: DatabaseSync;
  private _disposed = false;

  constructor(filename: string) {
    this._database = new DatabaseSync(filename);
    this._database.exec("PRAGMA foreign_keys = ON;");
    this._database.exec("PRAGMA busy_timeout = 5000;");
    this._database.exec("PRAGMA journal_mode = WAL;");
    this._database.exec(
      readFileSync(new URL("./schema.sql", import.meta.url), "utf8")
    );
  }

  getOrCreateCookieSecret(): string {
    this._assertOpen();
    const existing = this._database
      .prepare("SELECT value FROM demo_settings WHERE key = 'cookie_secret'")
      .get() as SettingRow | undefined;
    if (existing) return existing.value;

    const value = randomBytes(32).toString("base64url");
    this._database
      .prepare(
        "INSERT OR IGNORE INTO demo_settings (key, value) VALUES ('cookie_secret', ?)"
      )
      .run(value);
    const stored = this._database
      .prepare("SELECT value FROM demo_settings WHERE key = 'cookie_secret'")
      .get() as SettingRow | undefined;
    if (!stored) throw new Error("Failed to initialize the guest cookie secret");
    return stored.value;
  }

  createGuest(): Guest {
    this._assertOpen();
    const guest: Guest = {
      guestId: randomUUID(),
      name: `Guest ${randomBytes(2).toString("hex").toUpperCase()}`,
      createdAt: Date.now(),
    };
    this._database
      .prepare(
        `INSERT INTO demo_guests (guest_id, display_name, created_at)
         VALUES (?, ?, ?)`
      )
      .run(guest.guestId, guest.name, guest.createdAt);
    return guest;
  }

  getGuest(guestId: string): Guest | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT guest_id, display_name, created_at
         FROM demo_guests
         WHERE guest_id = ?`
      )
      .get(guestId) as GuestRow | undefined;
    return row ? rowToGuest(row) : null;
  }

  recordInitialHistory(unitID: string, userId: string): void {
    this._recordHistory({
      unitID,
      revision: 1,
      userId,
      commands: ["univer.mutation.create-unit"],
      createdAt: Date.now(),
    });
  }

  recordChangeset(changeset: IChangeset): void {
    const restoredRevision = readRestoredRevision(changeset);
    this._recordHistory({
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
         FROM demo_history
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

  listCreators(unitID: string): readonly Guest[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT DISTINCT g.guest_id, g.display_name, g.created_at
         FROM demo_history h
         JOIN demo_guests g ON g.guest_id = h.user_id
         WHERE h.unit_id = ?
         ORDER BY g.created_at ASC`
      )
      .all(unitID) as unknown as GuestRow[];
    return rows.map(rowToGuest);
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    this._database.close();
  }

  private _recordHistory(entry: HistoryEntry): void {
    this._assertOpen();
    this._database
      .prepare(
        `INSERT INTO demo_history
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
    if (this._disposed) throw new Error("Demo store is disposed");
  }
}

function rowToGuest(row: GuestRow): Guest {
  return {
    guestId: row.guest_id,
    name: row.display_name,
    createdAt: row.created_at,
  };
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
