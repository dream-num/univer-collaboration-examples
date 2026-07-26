import { validateDocumentAfterApply } from "@univerjs-pro/collaboration";
import type { IBaseSnapshot, IDocumentData } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import {
  CREATABLE_UNIT_TYPES,
  createInitialUnit,
} from "../server/unit-data.js";
import { assertBlankBase } from "../server/temporary-unit-snapshot.js";

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

    expect(unit.kind).toBe("data");
    if (unit.kind !== "data") throw new Error("Expected data creation");
    expect(validateDocumentAfterApply(unit.input.data as IDocumentData)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("encodes a blank Board as a revision-1 Board snapshot", () => {
    const unit = createInitialUnit(
      UniverType.UNIVER_BOARD,
      "board-1",
      "Agent Board"
    );

    expect(unit.kind).toBe("snapshot");
    if (unit.kind !== "snapshot") throw new Error("Expected snapshot creation");
    expect(unit.input.sheetBlocks).toBeUndefined();
    expect(unit.input.snapshot).toMatchObject({
      unitID: "board-1",
      rev: 1,
      type: UniverType.UNIVER_BOARD,
      board: {
        unitID: "board-1",
        rev: 1,
        name: "Agent Board",
      },
    });
    const board = JSON.parse(
      new TextDecoder().decode(unit.input.snapshot.board!.originalMeta)
    ) as { id: string; rev: number; pageOrder: string[] };
    expect(board).toMatchObject({ id: "board-1", rev: 1 });
    expect(board.pageOrder).toHaveLength(1);
  });

  it("encodes a blank Base as workbook-shaped metadata without blocks", () => {
    const unit = createInitialUnit(
      UniverType.UNIVER_BASE,
      "base-1",
      "Agent Base"
    );

    expect(unit.kind).toBe("snapshot");
    if (unit.kind !== "snapshot") throw new Error("Expected snapshot creation");
    expect(unit.input.sheetBlocks).toBeUndefined();
    expect(unit.input.snapshot).toMatchObject({
      unitID: "base-1",
      rev: 1,
      type: UniverType.UNIVER_BASE,
      workbook: {
        unitID: "base-1",
        rev: 1,
        name: "Agent Base",
        sheetOrder: ["table-1"],
        blockMeta: {
          "table-1": { sheetID: "table-1", blocks: [] },
        },
      },
    });
    expect(unit.input.snapshot.workbook!.sheets["table-1"]).toMatchObject({
      rowCount: 5,
      columnCount: 1,
    });
  });

  it("rejects non-empty Base cell data in the temporary encoder", () => {
    const base = {
      tables: { "table-1": { cellData: { 0: { 0: { v: "value" } } } } },
    } as unknown as IBaseSnapshot;

    expect(() => assertBlankBase(base)).toThrow(
      "only supports blank initial cell data"
    );
  });
});
