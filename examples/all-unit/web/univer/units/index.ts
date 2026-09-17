import type { Univer } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import type { MountUniverEditorOptions } from "../types";
import { registerBaseUnit } from "./base";
import { registerBoardUnit } from "./board";
import { registerDocUnit } from "./doc";
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
  } else {
    throw new Error(`Unsupported Unit type: ${options.unitType}`);
  }
}
