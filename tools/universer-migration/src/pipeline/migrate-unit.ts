// Migrates one Unit. The steps run in this order, each in its own method:
//   1. Read      – rebuild every snapshot, block and changeset from Universer.
//   2. Prepare   – look at the target; a Unit that exists is resumed from its head.
//   3. Create    – create the Unit with its revision 1 snapshot.
//   4. Changesets – append the missing revisions with their original times.
//   5. Snapshots – store the remaining snapshots, reusing identical blocks.
//   6. Comments and files.
//   7. Verify    – replay the target copy to its head with the SDK runtime.
//   8. Deleted state – a Unit in the Universer trash is put in the SDK trash.
// Re-running is safe: every step only writes what the target does not have yet.
import type { UnitMetadata } from "@univerjs-pro/collaboration-service";
import type { SourceUnit, SourceUnitRow, UnitResult } from "../model.js";
import type { UnitReader } from "../source/unit-reader.js";
import { BlockDeduper } from "../target/block-dedupe.js";
import type { TargetStore, TargetUnitState } from "../target/target-store.js";
import type { ReplayVerifier } from "../verify/replay-verifier.js";

export interface UnitMigratorOptions {
  readonly reader: UnitReader;
  /** Absent in a dry run. */
  readonly target?: TargetStore;
  /** Absent when verification is turned off. */
  readonly verifier?: ReplayVerifier;
  readonly blockDedupe: boolean;
  readonly defaultCreatorID: string;
}

interface WriteCounts {
  snapshots: number;
  changesets: number;
  blocks: number;
  comments: number;
  files: number;
}

export class UnitMigrator {
  constructor(private readonly _options: UnitMigratorOptions) {}

  async migrate(unit: SourceUnitRow): Promise<UnitResult> {
    const startedAt = Date.now();
    const base = { unitID: unit.unitID, type: unit.type };
    if (unit.purgeStatus) {
      return { ...base, status: "skipped", reason: "Universer is permanently deleting this unit" };
    }
    try {
      const source = await this._options.reader.read(unit);
      const { target } = this._options;
      if (!target) {
        return { ...base, status: "checked", ...sourceCounts(source), durationMs: Date.now() - startedAt };
      }
      const state = await this._prepare(target, source);
      const counts: WriteCounts = { snapshots: 0, changesets: 0, blocks: 0, comments: 0, files: 0 };
      const metadata = unitMetadata(unit);
      const deduper = this._options.blockDedupe ? new BlockDeduper() : undefined;

      const head = state ? state.headRevision : await this._create(target, source, metadata, deduper, counts);
      await this._appendChangesets(target, source, head, metadata, counts);
      await this._saveSnapshots(target, source, state?.snapshotRevision ?? 1, deduper, counts);
      counts.comments = await target.insertComments(unit.unitID, source.comments);
      counts.files = await target.registerFiles(source.files);
      const verified = await this._verify(source);
      if (unit.deletedAtMs !== null) await target.setSoftDeleted(unit.unitID, unit.deletedAtMs);

      return {
        ...base,
        status: !state ? "migrated" : counts.changesets || counts.snapshots ? "resumed" : "up-to-date",
        softDeleted: unit.deletedAtMs !== null,
        sourceHead: source.headRevision,
        targetHead: source.headRevision,
        ...counts,
        ...(source.missingFileIDs.length ? { missingFiles: source.missingFileIDs } : {}),
        ...(verified === undefined ? {} : { verified }),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return { ...base, status: "failed", error: errorMessage(error), durationMs: Date.now() - startedAt };
    }
  }

  /** Step 2. A soft-deleted target Unit is reactivated while it is written; step 8 restores the state. */
  private async _prepare(target: TargetStore, source: SourceUnit): Promise<TargetUnitState | null> {
    const state = await target.getUnitState(source.unit.unitID);
    if (!state) return null;
    if (state.deletedStatus === "hard") throw new Error("The unit is permanently deleted in the target");
    if (state.headRevision > source.headRevision) {
      throw new Error(`Target head ${state.headRevision} is ahead of the source head ${source.headRevision}`);
    }
    if (state.deletedStatus === "soft") await target.setSoftDeleted(source.unit.unitID, null);
    return state;
  }

  /** Step 3. Returns the new head, which is revision 1. */
  private async _create(
    target: TargetStore,
    source: SourceUnit,
    metadata: UnitMetadata,
    deduper: BlockDeduper | undefined,
    counts: WriteCounts,
  ): Promise<number> {
    const first = source.snapshots[0];
    if (!first) throw new Error("Unit has no snapshot");
    const { snapshot, sheetBlocks } = deduper ? deduper.dedupe(first) : first;
    const creatorID = source.unit.creator || this._options.defaultCreatorID;
    await target.createUnit(source.unit, creatorID, metadata, snapshot, sheetBlocks);
    counts.snapshots += 1;
    counts.blocks += sheetBlocks.length;
    return 1;
  }

  /** Step 4. */
  private async _appendChangesets(
    target: TargetStore,
    source: SourceUnit,
    head: number,
    metadata: UnitMetadata,
    counts: WriteCounts,
  ): Promise<void> {
    const missing = source.changesets.filter((changeset) => changeset.record.revision > head);
    await target.appendChangesets(source.unit.unitID, head, missing, metadata);
    counts.changesets = missing.length;
  }

  /**
   * Step 5. Every snapshot passes through the deduper in revision order, including ones stored in an
   * earlier run, so a resumed run rewrites block IDs exactly as the first run did.
   */
  private async _saveSnapshots(
    target: TargetStore,
    source: SourceUnit,
    storedThrough: number,
    deduper: BlockDeduper | undefined,
    counts: WriteCounts,
  ): Promise<void> {
    const stored = new Set<string>();
    for (const original of source.snapshots) {
      const { snapshot, sheetBlocks } = deduper ? deduper.dedupe(original) : original;
      if (snapshot.rev <= storedThrough) {
        for (const block of sheetBlocks) stored.add(block.id);
        continue;
      }
      await target.saveSnapshot(snapshot, sheetBlocks);
      counts.snapshots += 1;
      counts.blocks += sheetBlocks.filter((block) => !stored.has(block.id)).length;
      for (const block of sheetBlocks) stored.add(block.id);
    }
  }

  /** Step 7. */
  private async _verify(source: SourceUnit): Promise<boolean | undefined> {
    if (!this._options.verifier) return undefined;
    await this._options.verifier.verify(source.unit.unitID, source.headRevision);
    return true;
  }
}

/** Universer fields with no SDK column are kept in the Unit metadata. */
function unitMetadata(unit: SourceUnitRow): UnitMetadata {
  return {
    migratedFrom: {
      system: "universer",
      name: unit.name,
      creator: unit.creator,
      customerIdempotencyKey: unit.customerIdempotencyKey,
      customerMetaData: unit.customerMetaData,
    },
  };
}

function sourceCounts(source: SourceUnit): Partial<UnitResult> {
  return {
    sourceHead: source.headRevision,
    snapshots: source.snapshots.length,
    changesets: source.changesets.length,
    blocks: new Set(source.snapshots.flatMap((snapshot) => snapshot.sheetBlocks.map((block) => block.id))).size,
    comments: source.comments.length,
    files: source.files.length,
    softDeleted: source.unit.deletedAtMs !== null,
    ...(source.missingFileIDs.length ? { missingFiles: source.missingFileIDs } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
