import { validateDocumentAfterApply } from "@univerjs-pro/collaboration";
import type { IBaseSnapshot, IDocumentData } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import {
  CREATABLE_UNIT_TYPES,
  createInitialUnit,
} from "../server/unit-data.js";

describe("createInitialUnit", () => {
  it("makes all five supported Unit types creatable", () => {
    expect(CREATABLE_UNIT_TYPES).toEqual([
      UniverType.UNIVER_SHEET,
      UniverType.UNIVER_DOC,
      UniverType.UNIVER_SLIDE,
      UniverType.UNIVER_BOARD,
      UniverType.UNIVER_BASE,
    ]);
  });

  it("creates a Doc snapshot accepted by the collaboration validator", () => {
    const unit = createInitialUnit(
      UniverType.UNIVER_DOC,
      "doc-1",
      "Agent Doc"
    );

    expect(unit.type).toBe(UniverType.UNIVER_DOC);
    expect(validateDocumentAfterApply(unit.data as IDocumentData)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("creates blank revision-1 Board data", () => {
    const unit = createInitialUnit(
      UniverType.UNIVER_BOARD,
      "board-1",
      "Agent Board"
    );

    expect(unit).toMatchObject({
      type: UniverType.UNIVER_BOARD,
      data: {
        id: "board-1",
        rev: 1,
        name: "Agent Board",
        pageOrder: ["page-1"],
      },
    });
  });

  it("creates blank revision-1 Base data from the SDK factory", () => {
    const unit = createInitialUnit(
      UniverType.UNIVER_BASE,
      "base-1",
      "Agent Base"
    );

    expect(unit).toMatchObject({
      type: UniverType.UNIVER_BASE,
      data: {
        id: "base-1",
        rev: 1,
        name: "Agent Base",
        tableOrder: ["table-1"],
      },
    });
    const base = unit.data as IBaseSnapshot;
    const table = base.tables["table-1"]!;
    expect(table.recordOrder).toHaveLength(5);
    expect(table.fieldOrder).toHaveLength(1);
    expect(Object.keys(table.cellData ?? {})).toHaveLength(5);
  });
});
