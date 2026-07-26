import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import type { UniverType } from "@univerjs/protocol";
import type { IDocumentData } from "@univerjs/core";
import type {
  StagedResourceStatus,
  WorkspaceWorktreeScope,
  WorkspaceWorktreeVisibility,
  WorkspaceWorktreeView,
} from "./model.js";

export interface WorktreeCatalogRecord {
  readonly worktreeID: string;
  readonly name: string;
  readonly summary?: string;
  readonly creatorUserID: string;
  readonly scope: WorkspaceWorktreeScope;
  readonly visibility: WorkspaceWorktreeVisibility;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly processedAt?: number;
  readonly units: readonly WorktreeCatalogUnitRecord[];
}

export interface WorktreeCatalogUnitRecord {
  readonly worktreeID: string;
  readonly unitID: string;
  readonly resourceID: string;
  readonly source: "trunk" | "worktree";
  readonly ordinal: number;
}

export interface StagedResourceRecord {
  readonly resourceID: string;
  readonly worktreeID: string;
  readonly unitID: string;
  readonly spaceID: string;
  readonly parentID: string | null;
  readonly name: string;
  readonly type: UniverType;
  readonly createdBy: string;
  readonly initialDataFingerprint?: string;
  readonly status: StagedResourceStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type WorkspaceWorktreeOperation =
  | {
      readonly operationID: string;
      readonly kind: "create-worktree";
      readonly actorUserID: string;
      readonly worktree: {
        readonly worktreeID: string;
        readonly name: string;
        readonly summary?: string;
        readonly creatorUserID: string;
        readonly scope: WorkspaceWorktreeScope;
        readonly visibility: WorkspaceWorktreeVisibility;
        readonly units: readonly {
          readonly unitID: string;
          readonly resourceID: string;
          readonly source: "trunk";
        }[];
      };
    }
  | {
      readonly operationID: string;
      readonly kind: "add-unit";
      readonly actorUserID: string;
      readonly unit: {
        readonly worktreeID: string;
        readonly unitID: string;
        readonly resourceID: string;
        readonly source: "trunk";
      };
    }
  | {
      readonly operationID: string;
      readonly kind: "create-unit";
      readonly actorUserID: string;
      readonly staged: Omit<
        StagedResourceRecord,
        "status" | "createdAt" | "updatedAt"
      >;
      readonly initialData?: IDocumentData;
    };

export type PendingWorkspaceWorktreeOperation =
  WorkspaceWorktreeOperation & {
    readonly createdAt: number;
  };

interface WorktreeRow {
  readonly worktree_id: string;
  readonly name: string;
  readonly summary: string | null;
  readonly creator_user_id: string;
  readonly scope_type: "user" | "space";
  readonly scope_user_id: string | null;
  readonly scope_space_id: string | null;
  readonly visibility: WorkspaceWorktreeVisibility;
  readonly created_at: number;
  readonly updated_at: number;
  readonly processed_at: number | null;
}

interface UnitRow {
  readonly worktree_id: string;
  readonly unit_id: string;
  readonly resource_id: string;
  readonly source: "trunk" | "worktree";
  readonly ordinal: number;
}

interface StagedRow {
  readonly resource_id: string;
  readonly worktree_id: string;
  readonly unit_id: string;
  readonly space_id: string;
  readonly parent_id: string | null;
  readonly name: string;
  readonly unit_type: number;
  readonly created_by: string;
  readonly initial_data_fingerprint: string | null;
  readonly status: StagedResourceStatus;
  readonly created_at: number;
  readonly updated_at: number;
}

interface OperationRow {
  readonly payload_json: string;
  readonly created_at: number;
}

export class WorkspaceWorktreeCatalog {
  private readonly _database: DatabaseSync;
  private _disposed = false;

  constructor(filename: string) {
    this._database = new DatabaseSync(filename);
    this._database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS workspace_worktrees (
        worktree_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        summary TEXT,
        creator_user_id TEXT NOT NULL,
        scope_type TEXT NOT NULL CHECK (scope_type IN ('user', 'space')),
        scope_user_id TEXT,
        scope_space_id TEXT,
        visibility TEXT NOT NULL CHECK (visibility IN ('private', 'space')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        processed_at INTEGER,
        CHECK (
          (scope_type = 'user' AND scope_user_id IS NOT NULL
            AND scope_space_id IS NULL AND visibility = 'private')
          OR
          (scope_type = 'space' AND scope_user_id IS NULL
            AND scope_space_id IS NOT NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS workspace_worktree_units (
        worktree_id TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('trunk', 'worktree')),
        ordinal INTEGER NOT NULL,
        PRIMARY KEY (worktree_id, unit_id),
        UNIQUE (worktree_id, resource_id),
        FOREIGN KEY (worktree_id)
          REFERENCES workspace_worktrees(worktree_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_staged_resources (
        resource_id TEXT PRIMARY KEY,
        worktree_id TEXT NOT NULL,
        unit_id TEXT NOT NULL UNIQUE,
        space_id TEXT NOT NULL,
        parent_id TEXT,
        name TEXT NOT NULL,
        unit_type INTEGER NOT NULL,
        created_by TEXT NOT NULL,
        initial_data_fingerprint TEXT,
        status TEXT NOT NULL
          CHECK (status IN ('staged', 'activation-pending', 'active', 'discarded')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (worktree_id, unit_id),
        FOREIGN KEY (worktree_id)
          REFERENCES workspace_worktrees(worktree_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS workspace_worktree_operations (
        operation_id TEXT PRIMARY KEY,
        operation_kind TEXT NOT NULL
          CHECK (operation_kind IN ('create-worktree', 'add-unit', 'create-unit')),
        worktree_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS workspace_worktrees_creator_view
        ON workspace_worktrees(creator_user_id, processed_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS workspace_worktrees_space_view
        ON workspace_worktrees(scope_space_id, visibility, processed_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS workspace_worktree_units_resource
        ON workspace_worktree_units(resource_id, worktree_id);
      CREATE INDEX IF NOT EXISTS workspace_staged_resources_worktree_status
        ON workspace_staged_resources(worktree_id, status);
      CREATE INDEX IF NOT EXISTS workspace_worktree_operations_created
        ON workspace_worktree_operations(created_at, operation_id);
    `);
  }

  create(input: {
    readonly worktreeID: string;
    readonly name: string;
    readonly summary?: string;
    readonly creatorUserID: string;
    readonly scope: WorkspaceWorktreeScope;
    readonly visibility: WorkspaceWorktreeVisibility;
    readonly units: readonly Omit<WorktreeCatalogUnitRecord, "worktreeID" | "ordinal">[];
    readonly now?: number;
  }): WorktreeCatalogRecord {
    this._assertOpen();
    const now = input.now ?? Date.now();
    this._database.exec("BEGIN IMMEDIATE");
    try {
      this._database
        .prepare(
          `INSERT INTO workspace_worktrees
            (worktree_id, name, summary, creator_user_id, scope_type,
             scope_user_id, scope_space_id, visibility, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.worktreeID,
          input.name,
          input.summary ?? null,
          input.creatorUserID,
          input.scope.kind,
          input.scope.kind === "user" ? input.scope.userID : null,
          input.scope.kind === "space" ? input.scope.spaceID : null,
          input.visibility,
          now,
          now
        );
      const insertUnit = this._database.prepare(
        `INSERT INTO workspace_worktree_units
          (worktree_id, unit_id, resource_id, source, ordinal)
         VALUES (?, ?, ?, ?, ?)`
      );
      input.units.forEach((unit, ordinal) => {
        insertUnit.run(
          input.worktreeID,
          unit.unitID,
          unit.resourceID,
          unit.source,
          ordinal
        );
      });
      this._database.exec("COMMIT");
    } catch (error) {
      this._database.exec("ROLLBACK");
      throw error;
    }
    return this.get(input.worktreeID)!;
  }

  get(worktreeID: string): WorktreeCatalogRecord | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT worktree_id, name, summary, creator_user_id, scope_type,
                scope_user_id, scope_space_id, visibility, created_at,
                updated_at, processed_at
         FROM workspace_worktrees WHERE worktree_id = ?`
      )
      .get(worktreeID) as WorktreeRow | undefined;
    return row ? this._toRecord(row) : null;
  }

  list(input: {
    readonly actorUserID: string;
    readonly view: WorkspaceWorktreeView;
    readonly scope?: "user" | "space";
    readonly spaceID?: string;
    readonly creatorUserID?: string;
  }): readonly WorktreeCatalogRecord[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT worktree_id, name, summary, creator_user_id, scope_type,
                scope_user_id, scope_space_id, visibility, created_at,
                updated_at, processed_at
         FROM workspace_worktrees
         WHERE (? = 'active' AND processed_at IS NULL
                OR ? = 'processed' AND processed_at IS NOT NULL)
           AND (? IS NULL OR scope_type = ?)
           AND (? IS NULL OR scope_space_id = ?)
           AND (? IS NULL OR creator_user_id = ?)
           AND (
             creator_user_id = ?
             OR (scope_type = 'space' AND visibility = 'space')
           )
         ORDER BY created_at DESC, worktree_id ASC`
      )
      .all(
        input.view,
        input.view,
        input.scope ?? null,
        input.scope ?? null,
        input.spaceID ?? null,
        input.spaceID ?? null,
        input.creatorUserID ?? null,
        input.creatorUserID ?? null,
        input.actorUserID
      ) as unknown as WorktreeRow[];
    return rows.map((row) => this._toRecord(row));
  }

  listAll(view: WorkspaceWorktreeView): readonly WorktreeCatalogRecord[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT worktree_id, name, summary, creator_user_id, scope_type,
                scope_user_id, scope_space_id, visibility, created_at,
                updated_at, processed_at
         FROM workspace_worktrees
         WHERE (? = 'active' AND processed_at IS NULL
                OR ? = 'processed' AND processed_at IS NOT NULL)
         ORDER BY created_at DESC, worktree_id ASC`
      )
      .all(view, view) as unknown as WorktreeRow[];
    return rows.map((row) => this._toRecord(row));
  }

  update(
    worktreeID: string,
    input: {
      readonly name?: string;
      readonly summary?: string | null;
      readonly visibility?: WorkspaceWorktreeVisibility;
    }
  ): WorktreeCatalogRecord | null {
    const current = this.get(worktreeID);
    if (!current) return null;
    this._database
      .prepare(
        `UPDATE workspace_worktrees
         SET name = ?, summary = ?, visibility = ?, updated_at = ?
         WHERE worktree_id = ?`
      )
      .run(
        input.name ?? current.name,
        input.summary === undefined ? current.summary ?? null : input.summary,
        input.visibility ?? current.visibility,
        Date.now(),
        worktreeID
      );
    return this.get(worktreeID);
  }

  addUnit(input: {
    readonly worktreeID: string;
    readonly unitID: string;
    readonly resourceID: string;
    readonly source: "trunk" | "worktree";
  }): WorktreeCatalogRecord {
    this._assertOpen();
    const current = this.get(input.worktreeID);
    if (!current) {
      throw new Error("Worktree does not exist");
    }
    const existing = current.units.find(
      (unit) =>
        unit.unitID === input.unitID || unit.resourceID === input.resourceID
    );
    if (existing) {
      if (
        existing.unitID !== input.unitID ||
        existing.resourceID !== input.resourceID ||
        existing.source !== input.source
      ) {
        throw new Error("Worktree Unit identity already uses different input");
      }
      return current;
    }
    this._database
      .prepare(
        `INSERT INTO workspace_worktree_units
          (worktree_id, unit_id, resource_id, source, ordinal)
         VALUES (?, ?, ?, ?,
           COALESCE((SELECT MAX(ordinal) + 1
                     FROM workspace_worktree_units WHERE worktree_id = ?), 0))
         ON CONFLICT(worktree_id, unit_id) DO NOTHING`
      )
      .run(
        input.worktreeID,
        input.unitID,
        input.resourceID,
        input.source,
        input.worktreeID
      );
    this._touch(input.worktreeID);
    return this.get(input.worktreeID)!;
  }

  stageResource(input: {
    readonly resourceID: string;
    readonly worktreeID: string;
    readonly unitID: string;
    readonly spaceID: string;
    readonly parentID: string | null;
    readonly name: string;
    readonly type: UniverType;
    readonly createdBy: string;
    readonly initialDataFingerprint?: string;
  }): StagedResourceRecord {
    const existing = this.getStagedResource(input.resourceID);
    if (existing) {
      assertSameStagedResource(existing, input);
      return existing;
    }
    const now = Date.now();
    this._database
      .prepare(
        `INSERT INTO workspace_staged_resources
          (resource_id, worktree_id, unit_id, space_id, parent_id, name,
           unit_type, created_by, initial_data_fingerprint, status,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', ?, ?)`
      )
      .run(
        input.resourceID,
        input.worktreeID,
        input.unitID,
        input.spaceID,
        input.parentID,
        input.name,
        input.type,
        input.createdBy,
        input.initialDataFingerprint ?? null,
        now,
        now
      );
    return this.getStagedResource(input.resourceID)!;
  }

  getStagedResource(resourceID: string): StagedResourceRecord | null {
    const row = this._database
      .prepare(
        `SELECT resource_id, worktree_id, unit_id, space_id, parent_id, name,
                unit_type, created_by, initial_data_fingerprint, status,
                created_at, updated_at
         FROM workspace_staged_resources WHERE resource_id = ?`
      )
      .get(resourceID) as StagedRow | undefined;
    return row ? toStaged(row) : null;
  }

  getStagedResourceByUnitID(unitID: string): StagedResourceRecord | null {
    const row = this._database
      .prepare(
        `SELECT resource_id, worktree_id, unit_id, space_id, parent_id, name,
                unit_type, created_by, initial_data_fingerprint, status,
                created_at, updated_at
         FROM workspace_staged_resources WHERE unit_id = ?`
      )
      .get(unitID) as StagedRow | undefined;
    return row ? toStaged(row) : null;
  }

  listStagedResources(worktreeID: string): readonly StagedResourceRecord[] {
    const rows = this._database
      .prepare(
        `SELECT resource_id, worktree_id, unit_id, space_id, parent_id, name,
                unit_type, created_by, initial_data_fingerprint, status,
                created_at, updated_at
         FROM workspace_staged_resources
         WHERE worktree_id = ?
         ORDER BY created_at, resource_id`
      )
      .all(worktreeID) as unknown as StagedRow[];
    return rows.map(toStaged);
  }

  setStagedStatus(
    resourceID: string,
    status: StagedResourceStatus
  ): StagedResourceRecord | null {
    this._database
      .prepare(
        `UPDATE workspace_staged_resources
         SET status = ?, updated_at = ? WHERE resource_id = ?`
      )
      .run(status, Date.now(), resourceID);
    return this.getStagedResource(resourceID);
  }

  removeStagedResource(resourceID: string): void {
    this._assertOpen();
    this._database
      .prepare(
        `DELETE FROM workspace_staged_resources
         WHERE resource_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM workspace_worktree_units
             WHERE resource_id = workspace_staged_resources.resource_id
           )`
      )
      .run(resourceID);
  }

  markProcessed(worktreeID: string, processedAt = Date.now()): void {
    this._database
      .prepare(
        `UPDATE workspace_worktrees
         SET processed_at = COALESCE(processed_at, ?), updated_at = ?
         WHERE worktree_id = ?`
      )
      .run(processedAt, processedAt, worktreeID);
  }

  beginOperation(
    operation: WorkspaceWorktreeOperation
  ): PendingWorkspaceWorktreeOperation {
    this._assertOpen();
    const existing = this._getOperation(operation.operationID);
    if (existing) {
      const { createdAt: _createdAt, ...existingOperation } = existing;
      if (!isDeepStrictEqual(existingOperation, operation)) {
        throw new Error("Operation identity already uses different input");
      }
      return existing;
    }
    const createdAt = Date.now();
    this._database
      .prepare(
        `INSERT INTO workspace_worktree_operations
          (operation_id, operation_kind, worktree_id, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        operation.operationID,
        operation.kind,
        operationWorktreeID(operation),
        JSON.stringify(operation),
        createdAt
      );
    return { ...operation, createdAt };
  }

  listPendingOperations(): readonly PendingWorkspaceWorktreeOperation[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT payload_json, created_at
         FROM workspace_worktree_operations
         ORDER BY created_at, operation_id`
      )
      .all() as unknown as OperationRow[];
    return rows.map(toOperation);
  }

  getPendingOperation(
    operationID: string
  ): PendingWorkspaceWorktreeOperation | null {
    this._assertOpen();
    return this._getOperation(operationID);
  }

  completeOperation(operationID: string): void {
    this._assertOpen();
    this._database
      .prepare(
        "DELETE FROM workspace_worktree_operations WHERE operation_id = ?"
      )
      .run(operationID);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._database.close();
  }

  private _toRecord(row: WorktreeRow): WorktreeCatalogRecord {
    const unitRows = this._database
      .prepare(
        `SELECT worktree_id, unit_id, resource_id, source, ordinal
         FROM workspace_worktree_units
         WHERE worktree_id = ? ORDER BY ordinal, unit_id`
      )
      .all(row.worktree_id) as unknown as UnitRow[];
    return {
      worktreeID: row.worktree_id,
      name: row.name,
      ...(row.summary === null ? {} : { summary: row.summary }),
      creatorUserID: row.creator_user_id,
      scope:
        row.scope_type === "user"
          ? { kind: "user", userID: row.scope_user_id! }
          : { kind: "space", spaceID: row.scope_space_id! },
      visibility: row.visibility,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.processed_at === null
        ? {}
        : { processedAt: row.processed_at }),
      units: unitRows.map((unit) => ({
        worktreeID: unit.worktree_id,
        unitID: unit.unit_id,
        resourceID: unit.resource_id,
        source: unit.source,
        ordinal: unit.ordinal,
      })),
    };
  }

  private _touch(worktreeID: string): void {
    this._database
      .prepare(
        "UPDATE workspace_worktrees SET updated_at = ? WHERE worktree_id = ?"
      )
      .run(Date.now(), worktreeID);
  }

  private _getOperation(
    operationID: string
  ): PendingWorkspaceWorktreeOperation | null {
    const row = this._database
      .prepare(
        `SELECT payload_json, created_at
         FROM workspace_worktree_operations WHERE operation_id = ?`
      )
      .get(operationID) as OperationRow | undefined;
    return row ? toOperation(row) : null;
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error("WorkspaceWorktreeCatalog is disposed");
  }
}

function toStaged(row: StagedRow): StagedResourceRecord {
  return {
    resourceID: row.resource_id,
    worktreeID: row.worktree_id,
    unitID: row.unit_id,
    spaceID: row.space_id,
    parentID: row.parent_id,
    name: row.name,
    type: row.unit_type as UniverType,
    createdBy: row.created_by,
    ...(row.initial_data_fingerprint === null
      ? {}
      : { initialDataFingerprint: row.initial_data_fingerprint }),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertSameStagedResource(
  existing: StagedResourceRecord,
  input: Omit<StagedResourceRecord, "status" | "createdAt" | "updatedAt">
): void {
  if (
    existing.worktreeID !== input.worktreeID ||
    existing.unitID !== input.unitID ||
    existing.spaceID !== input.spaceID ||
    existing.parentID !== input.parentID ||
    existing.name !== input.name ||
    existing.type !== input.type ||
    existing.createdBy !== input.createdBy ||
    existing.initialDataFingerprint !== input.initialDataFingerprint
  ) {
    throw new Error("Staged resource identity already uses different input");
  }
}

function toOperation(
  row: OperationRow
): PendingWorkspaceWorktreeOperation {
  return {
    ...(JSON.parse(row.payload_json) as WorkspaceWorktreeOperation),
    createdAt: row.created_at,
  };
}

function operationWorktreeID(
  operation: WorkspaceWorktreeOperation
): string {
  return operation.kind === "create-worktree"
    ? operation.worktree.worktreeID
    : operation.kind === "add-unit"
      ? operation.unit.worktreeID
      : operation.staged.worktreeID;
}
