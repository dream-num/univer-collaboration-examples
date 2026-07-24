import { DatabaseSync } from "node:sqlite";

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

interface CatalogRow {
  readonly worktree_id: string;
  readonly name: string;
  readonly created_at: number;
  readonly completed_at: number | null;
}

interface CatalogUnitRow {
  readonly unit_id: string;
}

export interface WorktreeCatalogEntry {
  readonly worktreeID: string;
  readonly name: string;
  readonly unitIDs: readonly string[];
  readonly createdAt: number;
  readonly completedAt?: number;
}

export interface CreateWorktreeCatalogEntryInput {
  readonly worktreeID: string;
  readonly name: string;
  readonly unitIDs: readonly string[];
  readonly createdAt: number;
}

/**
 * Worktree 的名称、发现范围与产品权限属于应用层，不进入协同数据库契约。
 * Demo 只使用固定用户，但仍把 Catalog 与 Worktree 生命周期存储分开。
 */
export class WorktreeCatalog {
  private readonly _database: DatabaseSync;
  private _disposed = false;

  constructor(filename: string) {
    this._database = new DatabaseSync(filename);
    try {
      this._database.exec("PRAGMA foreign_keys = ON;");
      this._database.exec(
        `PRAGMA busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS};`
      );
      if (filename !== ":memory:") {
        this._database.exec("PRAGMA journal_mode = WAL;");
      }
      this._database.exec(`
        CREATE TABLE IF NOT EXISTS worktree_demo_catalog (
          worktree_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          completed_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS worktree_demo_catalog_units (
          worktree_id TEXT NOT NULL,
          unit_id TEXT NOT NULL,
          PRIMARY KEY (worktree_id, unit_id),
          FOREIGN KEY (worktree_id)
            REFERENCES worktree_demo_catalog(worktree_id)
            ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS worktree_demo_catalog_units_unit
          ON worktree_demo_catalog_units(unit_id, worktree_id);
      `);
    } catch (error) {
      this._database.close();
      throw error;
    }
  }

  create(input: CreateWorktreeCatalogEntryInput): WorktreeCatalogEntry {
    this._assertOpen();
    validateCreateInput(input);
    this._database.exec("BEGIN IMMEDIATE;");
    try {
      this._database
        .prepare(
          `INSERT INTO worktree_demo_catalog
            (worktree_id, name, created_at, completed_at)
           VALUES (?, ?, ?, NULL)`
        )
        .run(input.worktreeID, input.name, input.createdAt);
      const insertUnit = this._database.prepare(
        `INSERT INTO worktree_demo_catalog_units (worktree_id, unit_id)
         VALUES (?, ?)`
      );
      for (const unitID of input.unitIDs) {
        insertUnit.run(input.worktreeID, unitID);
      }
      this._database.exec("COMMIT;");
    } catch (error) {
      this._database.exec("ROLLBACK;");
      throw error;
    }
    return this.get(input.worktreeID) as WorktreeCatalogEntry;
  }

  get(worktreeID: string): WorktreeCatalogEntry | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT worktree_id, name, created_at, completed_at
         FROM worktree_demo_catalog
         WHERE worktree_id = ?`
      )
      .get(worktreeID) as CatalogRow | undefined;
    return row ? this._toEntry(row) : null;
  }

  list(unitID?: string): readonly WorktreeCatalogEntry[] {
    this._assertOpen();
    const rows = (
      unitID
        ? this._database
            .prepare(
              `SELECT catalog.worktree_id, catalog.name,
                      catalog.created_at, catalog.completed_at
               FROM worktree_demo_catalog AS catalog
               JOIN worktree_demo_catalog_units AS unit
                 ON unit.worktree_id = catalog.worktree_id
               WHERE unit.unit_id = ?
               ORDER BY catalog.created_at DESC`
            )
            .all(unitID)
        : this._database
            .prepare(
              `SELECT worktree_id, name, created_at, completed_at
               FROM worktree_demo_catalog
               ORDER BY created_at DESC`
            )
            .all()
    ) as unknown as CatalogRow[];
    return rows.map((row) => this._toEntry(row));
  }

  markCompleted(worktreeID: string, completedAt: number): void {
    this._assertOpen();
    this._database
      .prepare(
        `UPDATE worktree_demo_catalog
         SET completed_at = COALESCE(completed_at, ?)
         WHERE worktree_id = ?`
      )
      .run(completedAt, worktreeID);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._database.close();
  }

  private _toEntry(row: CatalogRow): WorktreeCatalogEntry {
    const units = this._database
      .prepare(
        `SELECT unit_id
         FROM worktree_demo_catalog_units
         WHERE worktree_id = ?
         ORDER BY unit_id`
      )
      .all(row.worktree_id) as unknown as CatalogUnitRow[];
    return {
      worktreeID: row.worktree_id,
      name: row.name,
      unitIDs: units.map(({ unit_id }) => unit_id),
      createdAt: row.created_at,
      ...(row.completed_at === null
        ? {}
        : { completedAt: row.completed_at }),
    };
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error("WorktreeCatalog is disposed");
  }
}

function validateCreateInput(input: CreateWorktreeCatalogEntryInput): void {
  if (!input.worktreeID || !input.name.trim()) {
    throw new TypeError("Worktree Catalog identity and name are required");
  }
  if (
    !Number.isSafeInteger(input.createdAt) ||
    input.createdAt < 0 ||
    input.unitIDs.length === 0 ||
    input.unitIDs.some((unitID) => !unitID)
  ) {
    throw new TypeError("Invalid Worktree Catalog entry");
  }
  if (new Set(input.unitIDs).size !== input.unitIDs.length) {
    throw new TypeError("Worktree Catalog Unit IDs must be unique");
  }
}
