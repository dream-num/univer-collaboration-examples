// Proves that the SDK can load a migrated Unit: reads it back from the target adapter and replays the
// most recent snapshot plus the trailing changesets to the head with the SDK runtime. This is the only
// step that executes the migrated mutations, so a failure shows before users open the document.
import { UnitSnapshotMaterializer } from "@univerjs-pro/collaboration-service";
import type { DatabaseContext, IDatabaseAdapter } from "@univerjs-pro/collaboration-service";
import type { ISheetBlock } from "@univerjs/protocol";

export interface ReplayResult {
  /** Revision of the snapshot the replay started from. */
  readonly fromRevision: number;
  readonly headRevision: number;
}

export class ReplayVerifier {
  // In-process: a one-off command needs no Worker threads, and the CLI then depends on no build output.
  private readonly _materializer = new UnitSnapshotMaterializer({ execution: { mode: "in-process" } });

  constructor(private readonly _target: IDatabaseAdapter) {}

  async verify(unitID: string, expectedHead: number): Promise<ReplayResult> {
    const ctx: DatabaseContext = {
      userID: "universer-migration",
      customData: Object.create(null) as Record<string, unknown>,
      request: { unitID },
    };
    const unit = await this._target.getUnit(ctx, unitID);
    if (!unit) throw new Error("Unit is not readable in the target");
    if (unit.headRevision !== expectedHead) {
      throw new Error(`Target head is ${unit.headRevision}, source head is ${expectedHead}`);
    }
    const snapshot = await this._target.getSnapshot(ctx, unitID);
    if (!snapshot) throw new Error("Target has no snapshot");
    const changesets = (await this._target.getChangesets(ctx, unitID, { from: snapshot.rev })) ?? [];
    const sheetBlocks: ISheetBlock[] = [];
    for (const meta of Object.values(snapshot.workbook?.blockMeta ?? {})) {
      for (const blockID of meta.blocks) {
        const block = await this._target.getSheetBlock(ctx, unitID, blockID);
        if (!block) throw new Error(`Target is missing block ${blockID}`);
        sheetBlocks.push(block);
      }
    }
    const result = await this._materializer.materializeSnapshot({
      snapshot,
      sheetBlocks,
      changesets,
      targetRevision: expectedHead,
    });
    if (result.snapshot.rev !== expectedHead) {
      throw new Error(`Replay reached ${result.snapshot.rev}, expected ${expectedHead}`);
    }
    return { fromRevision: snapshot.rev, headRevision: result.snapshot.rev };
  }

  async dispose(): Promise<void> {
    await this._materializer.dispose();
  }
}
