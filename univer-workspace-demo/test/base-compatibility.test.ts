import type { UnitModel } from "@univerjs/core";
import { UniverInstanceType } from "@univerjs/core";
import { describe, expect, it, vi } from "vitest";
import { makeBaseSafeForCollaborationFormulaGuard } from "../src/units/base-compatibility.js";

type FormulaGuardUnit = UnitModel & {
  getSheetBySheetId?: (sheetID: string) => unknown;
};

describe("Base collaboration compatibility", () => {
  it("makes the collaboration formula guard ignore Base dirty ranges", () => {
    const unit = {
      type: UniverInstanceType.UNIVER_BASE,
    } as FormulaGuardUnit;

    makeBaseSafeForCollaborationFormulaGuard(unit);

    expect(unit.getSheetBySheetId?.("table-1")).toBeNull();
  });

  it("preserves a future SDK-native sheet resolver", () => {
    const getSheetBySheetId = vi.fn(() => ({ id: "table-1" }));
    const unit = {
      type: UniverInstanceType.UNIVER_BASE,
      getSheetBySheetId,
    } as unknown as FormulaGuardUnit;

    makeBaseSafeForCollaborationFormulaGuard(unit);

    expect(unit.getSheetBySheetId).toBe(getSheetBySheetId);
  });

  it("does not modify non-Base Units", () => {
    const unit = {
      type: UniverInstanceType.UNIVER_SHEET,
    } as FormulaGuardUnit;

    makeBaseSafeForCollaborationFormulaGuard(unit);

    expect(unit).not.toHaveProperty("getSheetBySheetId");
  });
});
