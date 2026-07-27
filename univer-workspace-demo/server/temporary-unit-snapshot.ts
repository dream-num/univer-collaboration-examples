import type { IBoardData } from "@univerjs-pro/boards";
import type { CreateUnitInput } from "@univerjs-pro/collaboration-service";
import type {
  IBaseSnapshot,
  ITableSnapshot,
} from "@univerjs/core";
import type {
  IBoardMeta,
  ISnapshot,
  IWorkbookMeta,
  IWorksheetMeta,
} from "@univerjs/protocol";
import { UniverType } from "@univerjs/protocol";

const textEncoder = new TextEncoder();

/**
 * Temporary Demo-only protocol encoder for blank Board/Base Units.
 *
 * Remove this module and use createUnitFromData after adopting a Univer Pro
 * release that contains https://github.com/dream-num/univer-pro/pull/5259.
 */
export function createTemporaryInitialSnapshot(
  type: UniverType.UNIVER_BOARD | UniverType.UNIVER_BASE,
  unitID: string,
  name: string
): CreateUnitInput {
  return type === UniverType.UNIVER_BOARD
    ? { snapshot: createBoardSnapshot(unitID, name) }
    : { snapshot: createBaseSnapshot(unitID, name) };
}

function createBoardSnapshot(unitID: string, name: string): ISnapshot {
  // @univerjs-pro/boards alpha.7 pulls the render engine from its root entry,
  // which cannot be loaded by the Node Demo server. Keep this minimal blank
  // model here; the browser editor still uses the public Board package.
  const pageID = "page-1";
  const page = {
    id: pageID,
    pageType: "page",
    name: "Board",
    elementOrder: [],
    elements: {},
    background: { type: "solid", color: "#ffffff" },
  } as IBoardData["pages"][string];
  const board: IBoardData = {
    id: unitID,
    rev: 1,
    name,
    appVersion: "1.0.0-alpha.7",
    locale: "enUS",
    defaultPageSize: { width: 1920, height: 1080 },
    pageOrder: [pageID],
    pages: { [pageID]: page },
    activePageId: pageID,
    slideOrder: [pageID],
    slides: { [pageID]: page },
    activeSlideId: pageID,
    boardSettings: {
      collaboratorCursorsVisible: true,
      gridVisible: false,
      quickAddEnabled: true,
      preciseSelection: false,
      showDimensions: false,
      showToolbar: true,
    },
  };
  const boardMeta: IBoardMeta = {
    unitID,
    rev: 1,
    creator: "",
    name,
    resources: board.resources ?? [],
    originalMeta: encodeJson(board),
  };
  return {
    unitID,
    rev: 1,
    type: UniverType.UNIVER_BOARD,
    workbook: undefined,
    doc: undefined,
    slide: undefined,
    board: boardMeta,
  };
}

function createBaseSnapshot(unitID: string, name: string): ISnapshot {
  const base = createBlankBaseData(unitID, name);
  assertBlankBase(base);

  const sheets: Record<string, IWorksheetMeta> = {};
  const blockMeta: IWorkbookMeta["blockMeta"] = {};
  for (const [tableID, table] of Object.entries(base.tables)) {
    sheets[tableID] = {
      id: table.id,
      type: 0,
      name: table.name,
      rowCount: table.recordOrder?.length ?? Object.keys(table.records).length,
      columnCount: table.fieldOrder.length,
      originalMeta: encodeBaseTableMeta(table),
    };
    blockMeta[tableID] = { sheetID: tableID, blocks: [] };
  }

  const workbook: IWorkbookMeta = {
    unitID,
    rev: 1,
    creator: base.createdBy ?? "",
    name,
    sheetOrder: base.tableOrder,
    sheets,
    blockMeta,
    resources: [],
    originalMeta: encodeBaseMeta(base),
  };
  return {
    unitID,
    rev: 1,
    type: UniverType.UNIVER_BASE,
    workbook,
    doc: undefined,
    slide: undefined,
    board: undefined,
  };
}

function createBlankBaseData(unitID: string, name: string): IBaseSnapshot {
  const now = Date.now();
  const tableID = "table-1";
  const fieldID = "field-1";
  const viewID = "view-1";
  const recordOrder = Array.from(
    { length: 5 },
    (_, index) => `${tableID}-record-${index + 1}`
  );
  const records = Object.fromEntries(
    recordOrder.map((recordID, index) => [
      recordID,
      {
        id: recordID,
        values: {},
        orderKey: String(index + 1).padStart(4, "0"),
        createdAt: now,
        updatedAt: now,
      },
    ])
  );
  const rowIndex = Object.fromEntries(
    recordOrder.map((recordID, index) => [recordID, index])
  );
  const rowId = Object.fromEntries(
    recordOrder.map((recordID, index) => [index, recordID])
  );
  const cellData = Object.fromEntries(
    recordOrder.map((_, index) => [index, {}])
  );
  const table: ITableSnapshot = {
    id: tableID,
    name: "Table 1",
    primaryFieldId: fieldID,
    fieldOrder: [fieldID],
    fields: {
      [fieldID]: {
        id: fieldID,
        name: "Name",
        type: "text" as ITableSnapshot["fields"][string]["type"],
        config: { placeholder: "bases.fieldConfig.textPlaceholder" },
      },
    },
    records,
    recordOrder,
    rowIndex,
    rowId,
    colIndex: { [fieldID]: 0 },
    colId: { 0: fieldID },
    cellData,
    resources: { attachmentSets: {}, attachments: {} },
    views: {
      [viewID]: {
        id: viewID,
        tableId: tableID,
        name: "Grid",
        type: "grid" as ITableSnapshot["views"][string]["type"],
        fieldOrder: [fieldID],
        fieldSettings: {},
        config: { frozenFieldCount: 1 },
      },
    },
    viewOrder: [viewID],
  };
  return {
    id: unitID,
    rev: 1,
    name,
    locale: "enUS" as NonNullable<IBaseSnapshot["locale"]>,
    appVersion: "1.0.0-alpha.7",
    schemaVersion: 1,
    tables: { [tableID]: table },
    tableOrder: [tableID],
    createdAt: now,
    updatedAt: now,
  };
}

export function assertBlankBase(base: IBaseSnapshot): void {
  for (const table of Object.values(base.tables)) {
    for (const row of Object.values(table.cellData ?? {})) {
      if (Object.keys(row).length > 0) {
        throw new Error(
          "The temporary Base encoder only supports blank initial cell data"
        );
      }
    }
  }
}

function encodeBaseMeta(base: IBaseSnapshot): Uint8Array {
  const { id, rev, name, tableOrder, tables, ...otherMeta } = base;
  void id;
  void rev;
  void name;
  void tableOrder;
  void tables;
  return encodeJson(otherMeta);
}

function encodeBaseTableMeta(table: ITableSnapshot): Uint8Array {
  const { id, name, cellData, ...otherMeta } = table;
  void id;
  void name;
  void cellData;
  return encodeJson(otherMeta);
}

function encodeJson(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}
