import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabService, UnitSnapshotMaterializer } from "@univerjs-pro/collaboration-service";
import { UniverType } from "@univerjs/protocol";
import { DEMO_USER, ensureUnits, units } from "../server/units";

test("five Units load and survive SQLite reopen without replacing edits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "all-unit-"));
  const filename = join(directory, "collaboration.sqlite");
  const context = { userID: DEMO_USER.userId };
  let database = new SQLiteDatabaseAdapter({ filename });
  let service = new UniverCollabService({ dbAdapter: database });
  const materializer = new UnitSnapshotMaterializer();
  try {
    await ensureUnits(service);
    assert.equal(new Set(units.map((unit) => unit.type)).size, 5);
    for (const unit of units) {
      const data = await service.getUnitLoadDataWithBlocks(
        { unitID: unit.unitId, type: unit.type, revision: 0 }, context,
      );
      const snapshot = await materializer.materializeSnapshot(data);
      assert.equal(snapshot.snapshot.unitID, unit.unitId);
      assert.equal(snapshot.snapshot.type, unit.type);
    }
    const result = await service.submitChangeset({ changeset: {
      unitID: "all-unit-sheet", type: UniverType.UNIVER_SHEET,
      baseRev: 1, revision: 2, userID: DEMO_USER.userId, memberID: "test-member",
      sid: "test-session", reqId: 1,
      mutations: [{ id: "sheet.mutation.set-range-values", data: JSON.stringify({
        unitId: "all-unit-sheet", subUnitId: "sheet-1", cellValue: { 0: { 0: { v: "persisted" } } },
      }) }],
    } }, { ...context, memberID: "test-member" });
    assert.equal(result.status, "committed");
    await service.dispose();
    await database.dispose();
    database = new SQLiteDatabaseAdapter({ filename });
    service = new UniverCollabService({ dbAdapter: database });
    await ensureUnits(service);
    for (const unit of units) {
      const data = await service.getUnitLoadData(
        { unitID: unit.unitId, type: unit.type, revision: 0 }, context,
      );
      assert.equal(data.targetRevision, unit.type === UniverType.UNIVER_SHEET ? 2 : 1);
    }
    const { changesets } = await service.getChangesets(
      { unitID: "all-unit-sheet", type: UniverType.UNIVER_SHEET, from: 1, to: 0 }, context,
    );
    assert.equal(changesets[0]?.mutations[0]?.data.includes("persisted"), true);
  } finally {
    await materializer.dispose();
    await service.dispose();
    await database.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
