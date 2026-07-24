import { validateDocumentAfterApply } from "@univerjs-pro/collaboration";
import type { IDocumentData } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import { createInitialUnitData } from "../server/unit-data.js";

describe("createInitialUnitData", () => {
  it("creates a Doc snapshot accepted by the collaboration validator", () => {
    const unit = createInitialUnitData(
      UniverType.UNIVER_DOC,
      "doc-1",
      "Agent Doc"
    );

    expect(validateDocumentAfterApply(unit.data as IDocumentData)).toEqual({
      ok: true,
      errors: [],
    });
  });
});
