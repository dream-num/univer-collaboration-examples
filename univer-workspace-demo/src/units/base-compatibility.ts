import { UniverInstanceType, type UnitModel } from "@univerjs/core";

type FormulaGuardCompatibleUnit = UnitModel & {
  getSheetBySheetId?: (sheetID: string) => null;
};

export function makeBaseSafeForCollaborationFormulaGuard(
  unit: UnitModel
): void {
  const compatibleUnit = unit as FormulaGuardCompatibleUnit;
  if (
    unit.type !== UniverInstanceType.UNIVER_BASE ||
    "getSheetBySheetId" in compatibleUnit
  ) {
    return;
  }

  Object.defineProperty(compatibleUnit, "getSheetBySheetId", {
    configurable: true,
    value: () => null,
  });
}
