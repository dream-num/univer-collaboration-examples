import type { Univer } from "@univerjs/core";
import type { FUniver } from "@univerjs/core/facade";
import { UniverType } from "@univerjs/protocol";
import type { MountUniverEditorOptions } from "../types";
import { registerBaseUnit } from "./base";
import { registerBoardUnit } from "./board";
import { registerDocUnit } from "./doc";
import { registerPdfUnit } from "./pdf";
import { registerSheetUnit } from "./sheet";
import { registerSlideUnit } from "./slide";

export async function loadUnitStyles(unitType: number) {
  if (unitType === UniverType.UNIVER_DOC) {
    await import("./doc/styles");
    return;
  }
  if (unitType === UniverType.UNIVER_SHEET) {
    await import("./sheet/styles");
    return;
  }
  if (unitType === UniverType.UNIVER_SLIDE) {
    await import("./slide/styles");
    return;
  }
  if (unitType === UniverType.UNIVER_BOARD) {
    await import("./board/styles");
    return;
  }
  if (unitType === UniverType.UNIVER_BASE) {
    await import("./base/styles");
    return;
  }
  if (unitType === UniverType.UNIVER_PDF) {
    await import("./pdf/styles");
    return;
  }
  throw new Error(`Unsupported Unit type: ${unitType}`);
}

export function registerUnitPlugins(
  univer: Univer,
  options: MountUniverEditorOptions,
) {
  if (options.unitType === UniverType.UNIVER_DOC) {
    registerDocUnit(univer, options);
  } else if (options.unitType === UniverType.UNIVER_SHEET) {
    registerSheetUnit(univer, options);
  } else if (options.unitType === UniverType.UNIVER_SLIDE) {
    registerSlideUnit(univer, options);
  } else if (options.unitType === UniverType.UNIVER_BOARD) {
    registerBoardUnit(univer, options);
  } else if (options.unitType === UniverType.UNIVER_BASE) {
    registerBaseUnit(univer, options);
  } else if (options.unitType === UniverType.UNIVER_PDF) {
    registerPdfUnit(univer, options);
  } else {
    throw new Error(`Unsupported Unit type: ${options.unitType}`);
  }
}

/** Load the Unit explicitly; call this after the current user has been set. */
export async function loadUnit(univerAPI: FUniver, unitType: number, unitId: string) {
  const collaboration = univerAPI.getCollaboration();
  if (unitType === UniverType.UNIVER_DOC) return collaboration.loadDocAsync(unitId);
  if (unitType === UniverType.UNIVER_SHEET) return collaboration.loadSheetAsync(unitId);
  if (unitType === UniverType.UNIVER_SLIDE) return collaboration.loadSlideAsync(unitId);
  if (unitType === UniverType.UNIVER_BOARD) return collaboration.loadBoardAsync(unitId);
  if (unitType === UniverType.UNIVER_BASE) return collaboration.loadBaseAsync(unitId);
  if (unitType === UniverType.UNIVER_PDF) return collaboration.loadPdfAsync(unitId);
  throw new Error(`Unsupported Unit type: ${unitType}`);
}
