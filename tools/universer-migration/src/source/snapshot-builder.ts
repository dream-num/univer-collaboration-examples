// Rebuilds protocol snapshots from Universer rows. Pure functions: the rules mirror Universer's
// construct* functions (internal/biz/snapshot.go) so the result equals what Universer serves to clients.
import type { IPdfMeta, ISheetBlock, ISnapshot, IWorkbookMeta, IWorksheetMeta } from "@univerjs/protocol";
import { UniverType } from "@univerjs/protocol";
import type { SourceUnitRow } from "../model.js";
import type { MetaSnapshotRow, ResourceRow, WorkbookSnapshotRow, WorksheetRow } from "./universer-database.js";

// `IResource` is not exported from the protocol entry.
type IResource = IWorkbookMeta["resources"][number];

const encoder = new TextEncoder();

/** `jsonb` metadata columns hold the JSON text that the protocol carries as UTF-8 bytes. */
export function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value ?? {}));
}

/** Universer returns resources in query order; the snapshot keeps the order of the reference list. */
export function orderResources(resourceIDs: readonly string[], rows: readonly ResourceRow[]): IResource[] {
  const byID = new Map(rows.map((row) => [row.resourceID, row]));
  // A missing resource is skipped, as Universer does, so the result matches what clients load today.
  return resourceIDs.flatMap((id) => {
    const row = byID.get(id);
    return row ? [{ id, name: row.name, data: row.data }] : [];
  });
}

/** Sheet and Base: worksheets, block references and resources come from separate tables. */
export function buildWorkbookSnapshot(
  unit: SourceUnitRow,
  row: WorkbookSnapshotRow,
  worksheets: readonly WorksheetRow[],
  resources: readonly ResourceRow[],
): ISnapshot {
  const sheets: Record<string, IWorksheetMeta> = {};
  for (const sheet of worksheets) {
    sheets[sheet.sheetID] = {
      id: sheet.sheetID,
      type: sheet.type,
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      originalMeta: encodeJson(sheet.originalMeta),
    };
  }
  const missing = row.sheetOrder.filter((sheetID) => !sheets[sheetID]);
  if (missing.length) {
    throw new Error(`Snapshot ${row.revision} has no worksheet rows for ${missing.join(", ")}`);
  }
  return {
    unitID: unit.unitID,
    type: unit.type,
    rev: row.revision,
    workbook: {
      unitID: unit.unitID,
      rev: row.revision,
      // Universer never stores the name or creator in snapshots; it fills them from the unit row.
      name: unit.name,
      creator: unit.creator,
      sheetOrder: [...row.sheetOrder],
      sheets,
      resources: orderResources(row.resourceIDs, resources),
      blockMeta: Object.fromEntries(
        Object.entries(row.blockIDsBySheet).map(([sheetID, blocks]) => [sheetID, { sheetID, blocks: [...blocks] }]),
      ),
      originalMeta: encodeJson(row.originalMeta),
    },
    doc: undefined,
    slide: undefined,
    board: undefined,
  };
}

/** Doc, Slide and Board share one layout: resources plus one metadata document. */
export function buildMetaSnapshot(unit: SourceUnitRow, row: MetaSnapshotRow, resources: readonly ResourceRow[]): ISnapshot {
  const meta = {
    unitID: unit.unitID,
    rev: row.revision,
    name: unit.name,
    creator: unit.creator,
    resources: orderResources(row.resourceIDs, resources),
    originalMeta: encodeJson(row.originalMeta),
  };
  const snapshot: ISnapshot = {
    unitID: unit.unitID,
    type: unit.type,
    rev: row.revision,
    workbook: undefined,
    doc: undefined,
    slide: undefined,
    board: undefined,
  };
  switch (unit.type) {
    case UniverType.UNIVER_DOC:
      return { ...snapshot, doc: meta };
    case UniverType.UNIVER_SLIDE:
      return { ...snapshot, slide: meta };
    case UniverType.UNIVER_BOARD:
      return { ...snapshot, board: meta };
    default:
      throw new Error(`Unit type ${unit.type} does not use a meta snapshot`);
  }
}

/**
 * PDF: `original_meta` holds a protojson `PdfMeta`, whose bytes field `originalMeta` is base64.
 * Like Universer, a value that is not a PdfMeta object becomes the raw `originalMeta`, and missing
 * identity fields are filled from the unit row.
 */
export function buildPdfSnapshot(unit: SourceUnitRow, row: MetaSnapshotRow): ISnapshot {
  const stored = row.originalMeta;
  const meta: IPdfMeta =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? pdfMetaFromProtoJson(stored as Record<string, unknown>)
      : { unitID: "", rev: 0, name: "", creator: "", originalMeta: encodeJson(stored) };
  return {
    unitID: unit.unitID,
    type: unit.type,
    rev: row.revision,
    workbook: undefined,
    doc: undefined,
    slide: undefined,
    board: undefined,
    pdf: {
      ...meta,
      unitID: meta.unitID || unit.unitID,
      rev: meta.rev || row.revision,
      name: meta.name || unit.name,
      creator: meta.creator || unit.creator,
    },
  };
}

function pdfMetaFromProtoJson(json: Record<string, unknown>): IPdfMeta {
  const { originalMeta, rev, ...rest } = json;
  return {
    ...(rest as Partial<IPdfMeta>),
    unitID: typeof json["unitID"] === "string" ? json["unitID"] : "",
    name: typeof json["name"] === "string" ? json["name"] : "",
    creator: typeof json["creator"] === "string" ? json["creator"] : "",
    rev: typeof rev === "number" ? rev : 0,
    originalMeta: typeof originalMeta === "string" ? new Uint8Array(Buffer.from(originalMeta, "base64")) : new Uint8Array(),
  } as IPdfMeta;
}

/** A Sheet block whose content is the cell-matrix JSON text, as Universer stores it. */
export function buildSheetBlock(blockID: string, startRow: number, endRow: number, content: Uint8Array): ISheetBlock {
  return {
    id: blockID,
    startRow,
    endRow,
    // Universer treats an empty object as `{}` (biz/workbook.go MGetSheetBlock).
    data: content.byteLength ? content : encoder.encode("{}"),
  };
}

export function allBlockIDs(snapshot: ISnapshot): string[] {
  return Object.values(snapshot.workbook?.blockMeta ?? {}).flatMap((meta) => meta.blocks);
}
