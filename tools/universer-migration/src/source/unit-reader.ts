// Reads one Unit from Universer: every snapshot with its blocks, every changeset, comments and the
// files it references. All tables are read in one transaction; block objects are read afterwards
// because they are immutable once written.
import type { ISheetBlock, ISnapshot } from "@univerjs/protocol";
import { UniverType } from "@univerjs/protocol";
import { mapWithLimit } from "../concurrency.js";
import type { SourceComment, SourceSnapshot, SourceUnit, SourceUnitRow } from "../model.js";
import type { UniverserBlobStore } from "../s3.js";
import { assertContiguous, toSourceChangeset } from "./changeset-converter.js";
import { collectFileIDs } from "./file-references.js";
import {
  allBlockIDs,
  buildMetaSnapshot,
  buildPdfSnapshot,
  buildSheetBlock,
  buildWorkbookSnapshot,
  encodeJson,
} from "./snapshot-builder.js";
import type { BlockRow, CommentRow, UniverserDatabase, UnitTablesReader } from "./universer-database.js";

const BLOCK_READ_CONCURRENCY = 8;

export class UnitReader {
  constructor(
    private readonly _database: UniverserDatabase,
    private readonly _blobs: UniverserBlobStore,
  ) {}

  async read(unit: SourceUnitRow): Promise<SourceUnit> {
    const { snapshots, blockRows, changesetRows, commentRows } = await this._database.readConsistently(async (tables) => {
      const snapshots = await readSnapshots(tables, unit);
      return {
        snapshots,
        blockRows: await tables.blocks([...new Set(snapshots.flatMap(allBlockIDs))]),
        changesetRows: await tables.changesets(unit.unitID, 1),
        commentRows: await tables.comments(unit.unitID),
      };
    });

    if (snapshots[0]?.rev !== 1) {
      throw new Error("Unit has no revision 1 snapshot");
    }
    assertContiguous(changesetRows, 2);
    const changesets = changesetRows.map((row) => toSourceChangeset(unit.unitID, unit.type, row));
    const headRevision = Math.max(snapshots.at(-1)?.rev ?? 1, changesets.at(-1)?.record.revision ?? 1);

    const blocks = await this._readBlocks(blockRows);
    // File metadata is immutable once written, so it is read outside the transaction.
    const fileIDs = collectFileIDs(snapshots, changesets.map((changeset) => changeset.record));
    const files = await this._database.readConsistently((tables) => tables.files(fileIDs));
    const found = new Set(files.map((file) => file.fileID));
    return {
      unit,
      snapshots: snapshots.map((snapshot) => withBlocks(snapshot, blocks)),
      changesets,
      headRevision,
      comments: commentRows.map(toSourceComment),
      files,
      missingFileIDs: fileIDs.filter((id) => !found.has(id)),
    };
  }

  private async _readBlocks(rows: readonly BlockRow[]): Promise<Map<string, ISheetBlock>> {
    const blocks = await mapWithLimit(rows, BLOCK_READ_CONCURRENCY, async (row) => {
      if (row.cipherKey) throw new Error(`Block ${row.blockID} is encrypted, which this tool does not support`);
      // Universer 1.x writes every block to the bucket; inline `rows` only exist in early data.
      const content = row.objectKey ? await this._blobs.read(row.objectKey) : encodeJson(row.rows);
      return buildSheetBlock(row.blockID, row.startRow, row.endRow, content);
    });
    return new Map(blocks.map((block) => [block.id, block]));
  }
}

async function readSnapshots(tables: UnitTablesReader, unit: SourceUnitRow): Promise<ISnapshot[]> {
  switch (unit.type) {
    case UniverType.UNIVER_SHEET:
    case UniverType.UNIVER_BASE: {
      const rows = await tables.workbookSnapshots(unit.unitID);
      const snapshots: ISnapshot[] = [];
      for (const row of rows) {
        const worksheets = await tables.worksheets(unit.unitID, row.snapshotID, row.sheetOrder);
        snapshots.push(buildWorkbookSnapshot(unit, row, worksheets, await tables.resources(row.resourceIDs)));
      }
      return snapshots;
    }
    case UniverType.UNIVER_DOC:
    case UniverType.UNIVER_SLIDE:
    case UniverType.UNIVER_BOARD: {
      const rows = await tables.metaSnapshots(unit.unitID, unit.type);
      const snapshots: ISnapshot[] = [];
      for (const row of rows) snapshots.push(buildMetaSnapshot(unit, row, await tables.resources(row.resourceIDs)));
      return snapshots;
    }
    case UniverType.UNIVER_PDF:
      return (await tables.metaSnapshots(unit.unitID, unit.type)).map((row) => buildPdfSnapshot(unit, row));
    default:
      throw new Error(`Unsupported unit type ${unit.type}`);
  }
}

function withBlocks(snapshot: ISnapshot, blocks: ReadonlyMap<string, ISheetBlock>): SourceSnapshot {
  const sheetBlocks = allBlockIDs(snapshot).map((id) => {
    const block = blocks.get(id);
    // A missing block must fail the Unit; treating it as empty would silently lose cell data.
    if (!block) throw new Error(`Snapshot ${snapshot.rev} references missing block ${id}`);
    return block;
  });
  return { snapshot, sheetBlocks };
}

function toSourceComment(row: CommentRow): SourceComment {
  const mentions = Array.isArray(row.mention) ? row.mention.map((item) => (typeof item === "string" ? item : JSON.stringify(item))) : [];
  return {
    threadID: row.threadID,
    replyID: row.replyID,
    authorUserID: row.userID,
    content: row.content,
    mentions,
    solved: row.solved,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
  };
}
