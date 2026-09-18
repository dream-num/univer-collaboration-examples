import { getBoardsEmptySnapshot } from "@univerjs-pro/boards";
import { getSlidesEmptySnapshot } from "@univerjs-pro/slides";
import {
  CollabError,
  type CreateUnitFromDataInput,
  type IUniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { getBasesEmptySnapshot, getDocsEmptySnapshot, LocaleType } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import type { UnitSummary } from "../shared/units";

export const DEMO_USER = { userId: "demo-user", displayName: "Demo User" };

export const units: readonly UnitSummary[] = [
  { unitId: "all-unit-sheet", type: UniverType.UNIVER_SHEET, name: "Sheet" },
  { unitId: "all-unit-doc", type: UniverType.UNIVER_DOC, name: "Doc" },
  { unitId: "all-unit-slide", type: UniverType.UNIVER_SLIDE, name: "Slide" },
  { unitId: "all-unit-board", type: UniverType.UNIVER_BOARD, name: "Board" },
  { unitId: "all-unit-base", type: UniverType.UNIVER_BASE, name: "Base" },
];

export async function ensureUnits(service: IUniverCollabService): Promise<void> {
  for (const unit of units) {
    try {
      await service.getUnitLoadData(
        { unitID: unit.unitId, type: unit.type, revision: 0 },
        { userID: DEMO_USER.userId },
      );
    } catch (error) {
      // Initialize only missing Units; preserve existing data and propagate other read failures.
      if (!(error instanceof CollabError) || error.code !== "UNIT_NOT_FOUND") throw error;
      await service.createUnitFromData(initialData(unit), { userID: DEMO_USER.userId });
    }
  }
}

function initialData(unit: UnitSummary): CreateUnitFromDataInput {
  const { unitId, name, type } = unit;
  switch (type) {
    case UniverType.UNIVER_SHEET:
      return {
        type,
        data: {
          id: unitId, rev: 1, name, appVersion: "", locale: LocaleType.EN_US,
          sheetOrder: ["sheet-1"],
          sheets: {
            "sheet-1": {
              id: "sheet-1", name: "Sheet 1", rowCount: 100, columnCount: 26, cellData: {},
            },
          },
          styles: {}, resources: [],
        },
      };
    case UniverType.UNIVER_DOC:
      return { type, data: { ...getDocsEmptySnapshot(unitId), rev: 1, title: name } };
    case UniverType.UNIVER_SLIDE:
      return { type, data: { ...getSlidesEmptySnapshot(unitId, LocaleType.EN_US, name), rev: 1 } };
    case UniverType.UNIVER_BOARD:
      return { type, data: { ...getBoardsEmptySnapshot(unitId, name), rev: 1 } };
    case UniverType.UNIVER_BASE:
      return { type, data: { ...getBasesEmptySnapshot(unitId), rev: 1, name } };
    default:
      throw new Error(`Unsupported Unit type: ${type}`);
  }
}
