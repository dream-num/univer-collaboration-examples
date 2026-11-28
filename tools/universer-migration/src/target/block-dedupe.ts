// Universer uploads every block again for each snapshot, under a new ID, even when the content did
// not change. The SDK adapter skips a block whose ID the Unit already stores, so rewriting later
// snapshots to reuse the first ID of identical content stores each distinct block once. This keeps the
// adapter contract "one block ID identifies one content".
import { createHash } from "node:crypto";
import type { ISheetBlock, ISnapshot } from "@univerjs/protocol";
import type { SourceSnapshot } from "../model.js";

export class BlockDeduper {
  private readonly _idByContent = new Map<string, string>();

  /** Returns the snapshot with block references rewritten, and only the blocks it still needs. */
  dedupe(source: SourceSnapshot): SourceSnapshot {
    const workbook = source.snapshot.workbook;
    if (!workbook) return source;
    const rewritten = new Map<string, string>();
    const blocks: ISheetBlock[] = [];
    for (const block of source.sheetBlocks) {
      const key = contentKey(block);
      const existing = this._idByContent.get(key);
      if (existing === undefined) {
        this._idByContent.set(key, block.id);
        blocks.push(block);
      } else {
        rewritten.set(block.id, existing);
        blocks.push({ ...block, id: existing });
      }
    }
    if (!rewritten.size) return source;
    const blockMeta = Object.fromEntries(
      Object.entries(workbook.blockMeta).map(([sheetID, meta]) => [
        sheetID,
        { ...meta, blocks: meta.blocks.map((id) => rewritten.get(id) ?? id) },
      ]),
    );
    const snapshot: ISnapshot = { ...source.snapshot, workbook: { ...workbook, blockMeta } };
    return { snapshot, sheetBlocks: uniqueByID(blocks) };
  }
}

function contentKey(block: ISheetBlock): string {
  return createHash("sha256")
    .update(`${block.startRow}:${block.endRow}:`)
    .update(block.data)
    .digest("hex");
}

function uniqueByID(blocks: readonly ISheetBlock[]): ISheetBlock[] {
  return [...new Map(blocks.map((block) => [block.id, block])).values()];
}
