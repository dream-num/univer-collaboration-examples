import {
  CollabError,
  type CommitChangesetInput,
  type CommitChangesetResult,
  type CreateUnitDatabaseInput,
  type CreateUnitDatabaseResult,
  type DatabaseContext,
  type DeleteUnitDatabaseStatus,
  type DeleteUnitsDatabaseInput,
  type DeleteUnitsDatabaseResult,
  type IDatabaseAdapter,
  type RecoverUnitDatabaseStatus,
  type RecoverUnitsDatabaseInput,
  type RecoverUnitsDatabaseResult,
  type SaveSnapshotInput,
  type SnapshotInfo,
  type SubmitDatabaseContext,
  type UnitRecord,
} from "@univerjs-pro/collaboration-service";
import type { IChangeset, ISheetBlock, ISnapshot } from "@univerjs/protocol";

interface StoredUnit {
  record: UnitRecord;
  status: "active" | "soft-deleted";
  readonly snapshots: Map<number, ISnapshot>;
  readonly changesets: IChangeset[];
  readonly sheetBlocks: Map<string, ISheetBlock>;
}

/**
 * An in-memory IDatabaseAdapter. Data is scoped to this instance and lost on process exit.
 * Reads and writes copy protocol objects to isolate stored data from caller mutations.
 */
export class CustomMemoryDatabaseAdapter implements IDatabaseAdapter {
  private readonly _units = new Map<string, StoredUnit>();
  private readonly _hardDeletedUnitIDs = new Set<string>();

  async getUnit(_ctx: DatabaseContext, unitID: string): Promise<UnitRecord | null> {
    return structuredClone(this._getActiveUnit(unitID)?.record ?? null);
  }

  async getSnapshot(
    _ctx: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<ISnapshot | null> {
    return structuredClone(this._getSnapshot(unitID, options));
  }

  async getSnapshotInfo(
    _ctx: DatabaseContext,
    unitID: string,
    options?: { readonly revision?: number },
  ): Promise<SnapshotInfo | null> {
    const snapshot = this._getSnapshot(unitID, options);
    return snapshot
      ? { unitID: snapshot.unitID, type: snapshot.type, rev: snapshot.rev }
      : null;
  }

  private _getSnapshot(
    unitID: string,
    options?: { readonly revision?: number },
  ): ISnapshot | null {
    if (options?.revision !== undefined && options.revision < 0) {
      throw new CollabError("INVALID_REQUEST", "Snapshot revision cannot be negative");
    }
    const unit = this._getActiveUnit(unitID);
    if (!unit) {
      return null;
    }
    const targetRevision = options?.revision ?? unit.record.headRevision;
    let nearestRevision = -1;
    for (const revision of unit.snapshots.keys()) {
      if (revision <= targetRevision && revision > nearestRevision) {
        nearestRevision = revision;
      }
    }
    return unit.snapshots.get(nearestRevision) ?? null;
  }

  async getChangesets(
    _ctx: DatabaseContext,
    unitID: string,
    range: { readonly from: number; readonly to?: number },
  ): Promise<readonly IChangeset[] | null> {
    if (range.from < 0 || (range.to !== undefined && range.to < 0)) {
      throw new CollabError("INVALID_REQUEST", "Changeset range revisions cannot be negative");
    }
    const unit = this._getActiveUnit(unitID);
    if (!unit) {
      return null;
    }

    return structuredClone(unit.changesets.filter(
      ({ revision }) => revision > range.from && (range.to === undefined || revision <= range.to),
    ));
  }

  async getSheetBlock(
    _ctx: DatabaseContext,
    unitID: string,
    blockID: string,
  ): Promise<ISheetBlock | null> {
    return structuredClone(this._getActiveUnit(unitID)?.sheetBlocks.get(blockID) ?? null);
  }

  async createUnit(
    _ctx: DatabaseContext,
    input: CreateUnitDatabaseInput,
  ): Promise<CreateUnitDatabaseResult> {
    const { record, snapshot, sheetBlocks = [] } = structuredClone(input);
    if (
      record.headRevision !== 1 ||
      snapshot.rev !== 1 ||
      snapshot.unitID !== record.unitID ||
      snapshot.type !== record.type
    ) {
      throw new CollabError(
        "INVALID_REQUEST",
        "Initial record and snapshot must match at revision 1",
      );
    }

    if (this._hardDeletedUnitIDs.has(record.unitID)) {
      throw new CollabError("INVALID_REQUEST", "A hard-deleted unit ID cannot be reused");
    }
    const existing = this._units.get(record.unitID);
    if (existing) {
      if (existing.status !== "active") {
        throw new CollabError("INVALID_REQUEST", "A deleted unit ID cannot be reused");
      }
      return {
        status: "already-exists",
        record: structuredClone(existing.record),
      };
    }

    this._units.set(record.unitID, {
      record,
      status: "active",
      snapshots: new Map([[1, snapshot]]),
      changesets: [],
      sheetBlocks: new Map(sheetBlocks.map((block) => [block.id, block])),
    });
    return { status: "created", record: structuredClone(record) };
  }

  async commitChangeset(
    _ctx: SubmitDatabaseContext,
    input: CommitChangesetInput,
  ): Promise<CommitChangesetResult> {
    const unit = this._requireActiveUnit(input.changeset.unitID);
    const { changeset } = structuredClone(input);
    const expectedHeadRevision = changeset.revision - 1;
    // Checking the head, saving the changeset, and updating the head must be atomic.
    // This memory implementation uses synchronous execution; a database needs one transaction.
    // Return revision-mismatch when the head differs so the Service can reload and retry.
    if (unit.record.headRevision !== expectedHeadRevision) {
      return {
        status: "revision-mismatch",
        actualHeadRevision: unit.record.headRevision,
      };
    }

    unit.changesets.push(changeset);
    unit.record = { ...unit.record, headRevision: changeset.revision };
    return {
      status: "committed",
      changeset: structuredClone(changeset),
      headRevision: changeset.revision,
    };
  }

  async saveSnapshot(_ctx: DatabaseContext, input: SaveSnapshotInput): Promise<void> {
    const unit = this._requireActiveUnit(input.snapshot.unitID);
    const { snapshot, sheetBlocks = [] } = structuredClone(input);
    if (
      snapshot.type !== unit.record.type ||
      snapshot.rev < 1 ||
      snapshot.rev > unit.record.headRevision
    ) {
      throw new CollabError("INVALID_REQUEST", "Snapshot does not match the stored unit head");
    }
    for (const block of sheetBlocks) {
      unit.sheetBlocks.set(block.id, block);
    }
    unit.snapshots.set(snapshot.rev, snapshot);
  }

  async deleteUnits(
    _ctx: DatabaseContext,
    input: DeleteUnitsDatabaseInput,
  ): Promise<DeleteUnitsDatabaseResult> {
    // Validate the entire batch first so a missing ID cannot leave earlier Units deleted.
    const unitsToDelete: StoredUnit[] = [];
    const units: { unitID: string; status: DeleteUnitDatabaseStatus }[] = [];
    for (const unitID of new Set(input.unitIDs)) {
      const unit = this._units.get(unitID);
      if (!unit) {
        if (input.hardDelete && this._hardDeletedUnitIDs.has(unitID)) {
          units.push({ unitID, status: "already-hard-deleted" });
          continue;
        }
        throw new CollabError("UNIT_NOT_FOUND", "Cannot delete a missing unit");
      }

      let status: DeleteUnitDatabaseStatus;
      if (input.hardDelete) {
        status = "hard-deleted";
      } else {
        status = unit.status === "soft-deleted" ? "already-soft-deleted" : "soft-deleted";
      }
      units.push({ unitID, status });
      unitsToDelete.push(unit);
    }

    for (const unit of unitsToDelete) {
      if (input.hardDelete) {
        // Retain the Unit ID after deletion to prevent recreating it within this instance.
        this._units.delete(unit.record.unitID);
        this._hardDeletedUnitIDs.add(unit.record.unitID);
      } else {
        unit.status = "soft-deleted";
      }
    }
    return { units };
  }

  async recoverUnits(
    _ctx: DatabaseContext,
    input: RecoverUnitsDatabaseInput,
  ): Promise<RecoverUnitsDatabaseResult> {
    // Validate the entire batch first so an unrecoverable Unit cannot leave a partial recovery.
    const unitsToRecover: StoredUnit[] = [];
    for (const unitID of new Set(input.unitIDs)) {
      if (this._hardDeletedUnitIDs.has(unitID)) {
        throw new CollabError("INVALID_REQUEST", "A hard-deleted unit cannot be recovered");
      }
      const unit = this._units.get(unitID);
      if (!unit) {
        throw new CollabError("UNIT_NOT_FOUND", "Cannot recover a missing unit");
      }
      unitsToRecover.push(unit);
    }

    const units: { unitID: string; status: RecoverUnitDatabaseStatus }[] = [];
    for (const unit of unitsToRecover) {
      units.push({
        unitID: unit.record.unitID,
        status: unit.status === "active" ? "already-active" : "recovered",
      });
      unit.status = "active";
    }
    return { units };
  }

  async dispose(): Promise<void> {
    this._units.clear();
    this._hardDeletedUnitIDs.clear();
  }

  private _getActiveUnit(unitID: string): StoredUnit | undefined {
    const unit = this._units.get(unitID);
    return unit?.status === "active" ? unit : undefined;
  }

  private _requireActiveUnit(unitID: string): StoredUnit {
    const unit = this._getActiveUnit(unitID);
    if (!unit) {
      throw new CollabError("UNIT_NOT_FOUND", "Unit is not active");
    }
    return unit;
  }
}
