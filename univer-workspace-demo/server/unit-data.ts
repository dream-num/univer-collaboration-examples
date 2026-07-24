import type { ISlideData } from "@univerjs-pro/slides";
import type {
  IDocumentData,
  IWorkbookData,
  LocaleType,
} from "@univerjs/core";
import {
  UniverType,
} from "@univerjs/protocol";
import type { CreateUnitFromDataInput } from "@univerjs/collaboration-service";

export const CREATABLE_UNIT_TYPES = [
  UniverType.UNIVER_SHEET,
  UniverType.UNIVER_DOC,
  UniverType.UNIVER_SLIDE,
] as const;

const EN_US = "enUS" as LocaleType;

export type CreatableUnitType = (typeof CREATABLE_UNIT_TYPES)[number];

export function isCreatableUnitType(value: unknown): value is CreatableUnitType {
  return (
    typeof value === "number" &&
    CREATABLE_UNIT_TYPES.includes(value as CreatableUnitType)
  );
}

export function createInitialUnitData(
  type: CreatableUnitType,
  unitID: string,
  name: string
): CreateUnitFromDataInput {
  switch (type) {
    case UniverType.UNIVER_SHEET:
      return { type, data: createWorkbookData(unitID, name) };
    case UniverType.UNIVER_DOC: {
      return { type, data: createDocumentData(unitID, name) };
    }
    case UniverType.UNIVER_SLIDE: {
      return { type, data: createSlideData(unitID, name) };
    }
  }
}

function createDocumentData(unitID: string, name: string): IDocumentData {
  return {
    id: unitID,
    rev: 1,
    locale: EN_US,
    title: name,
    tableSource: {},
    drawings: {},
    drawingsOrder: [],
    headers: {},
    footers: {},
    body: {
      dataStream: "\r\n",
      textRuns: [],
      customBlocks: [],
      tables: [],
      columnGroups: [],
      blockRanges: [],
      customRanges: [],
      customDecorations: [],
      paragraphs: [
        {
          startIndex: 0,
          paragraphId: `para_${unitID}`,
          paragraphStyle: {},
        },
      ],
      sectionBreaks: [
        {
          sectionId: `section-${unitID}`,
          startIndex: 1,
        },
      ],
    },
    documentStyle: {
      pageSize: { width: 960, height: 1122.6666666666667 },
      documentFlavor: 2,
      marginTop: 50,
      marginBottom: 50,
      marginRight: 50,
      marginLeft: 50,
    },
    settings: {},
  };
}

function createSlideData(unitID: string, name: string): ISlideData {
  const slideID = "slide-1";
  return {
    id: unitID,
    rev: 1,
    name,
    appVersion: "",
    locale: EN_US,
    defaultPageSize: { width: 960, height: 540 },
    slideOrder: [slideID],
    slides: {
      [slideID]: {
        id: slideID,
        pageType: "slide" as ISlideData["slides"][string]["pageType"],
        name: "Slide 1",
        elementOrder: [],
        elements: {},
      },
    },
    activeSlideId: slideID,
    resources: [],
  };
}

function createWorkbookData(unitID: string, name: string): IWorkbookData {
  const sheetID = "sheet-1";
  return {
    id: unitID,
    rev: 1,
    name,
    appVersion: "",
    locale: EN_US,
    styles: {},
    sheetOrder: [sheetID],
    sheets: {
      [sheetID]: {
        id: sheetID,
        name: "Sheet 1",
        rowCount: 1000,
        columnCount: 26,
        cellData: {},
      },
    },
    resources: [],
  };
}
