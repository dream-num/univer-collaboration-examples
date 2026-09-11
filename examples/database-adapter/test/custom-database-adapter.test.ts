import assert from "node:assert/strict";
import { test } from "node:test";
import type Database from "better-sqlite3";
import type { IDatabaseAdapter, SubmitDatabaseContext } from "@univerjs-pro/collaboration-service";
import { UniverType, type IChangeset, type ISnapshot } from "@univerjs/protocol";
import { CustomMemoryDatabaseAdapter } from "../server/custom-database-adapter/custom-memory-database-adapter.js";
import { CustomSQLiteDatabaseAdapter } from "../server/custom-database-adapter/custom-sqlite-database-adapter.js";

const unitID = "read-test";
const type = UniverType.UNIVER_DOC;
const snapshot = (rev: number): ISnapshot => ({
  unitID, type, rev, workbook: undefined, doc: undefined, slide: undefined, board: undefined,
});
const changeset = (revision: number): IChangeset => ({
  unitID, type, revision, baseRev: revision - 1, sid: "read-test", reqId: revision,
  userID: "user", memberID: "member", mutations: [],
});
const context: SubmitDatabaseContext = {
  userID: "user", memberID: "member", customData: Object.create(null),
  request: { changeset: changeset(2) },
};

async function seed(adapter: IDatabaseAdapter): Promise<void> {
  await adapter.createUnit(context, {
    record: { unitID, type, headRevision: 1 }, snapshot: snapshot(1),
  });
  for (let revision = 2; revision <= 5; revision++) {
    await adapter.commitChangeset(context, { changeset: changeset(revision) });
  }
  await adapter.saveSnapshot(context, { snapshot: snapshot(4) });
  await adapter.saveSnapshot(context, { snapshot: snapshot(2) });
}

const factories: Record<string, () => IDatabaseAdapter> = {
  Memory: () => new CustomMemoryDatabaseAdapter(),
  SQLite: () => new CustomSQLiteDatabaseAdapter({ filename: ":memory:" }),
};
for (const [name, create] of Object.entries(factories)) {
  test(`${name}: latest reads preserve revision bounds, isolation and lifecycle visibility`, async () => {
    const adapter = create();
    try {
      await seed(adapter);
      // head 为 5，最新快照为 4，最后保存的旧快照为 2。
      for (const [revision, expected] of [[undefined, 4], [0, null], [1, 1], [3, 2], [99, 4]] as const) {
        assert.equal((await adapter.getSnapshot(context, unitID, revision === undefined ? {} : { revision }))?.rev ?? null, expected);
        assert.equal((await adapter.getSnapshotInfo(context, unitID, revision === undefined ? {} : { revision }))?.rev ?? null, expected);
      }
      const latest = await adapter.getSnapshot(context, unitID);
      latest!.rev = 99;
      assert.equal((await adapter.getSnapshotInfo(context, unitID))?.rev, 4);
      for (const [from, to, expected] of [
        [0, undefined, [2, 3, 4, 5]], [4, undefined, [5]], [5, undefined, []],
        [99, undefined, []], [0, 0, []], [4, 2, []], [2, 4, [3, 4]],
      ] as const) {
        assert.deepEqual((await adapter.getChangesets(context, unitID, { from, ...(to === undefined ? {} : { to }) }))?.map((cs) => cs.revision), expected);
      }
      const tail = await adapter.getChangesets(context, unitID, { from: 4 });
      tail![0]!.revision = 99;
      assert.equal((await adapter.getChangesets(context, unitID, { from: 4 }))?.[0]?.revision, 5);
      await adapter.deleteUnits(context, { unitIDs: [unitID], hardDelete: false });
      assert.equal(await adapter.getSnapshot(context, unitID), null);
      assert.equal(await adapter.getSnapshotInfo(context, unitID), null);
      assert.equal(await adapter.getChangesets(context, unitID, { from: 4 }), null);
      await adapter.recoverUnits(context, { unitIDs: [unitID] });
      assert.equal((await adapter.getSnapshotInfo(context, unitID))?.rev, 4);
    } finally {
      await adapter.dispose?.();
    }
  });
}

test("SQLite: latest and bounded reads use one index query without scanning or sorting history", async () => {
  const adapter = new CustomSQLiteDatabaseAdapter({ filename: ":memory:" });
  try {
    await seed(adapter);
    const database = (adapter as unknown as { _database: Database.Database })._database;
    const prepare = database.prepare.bind(database);
    const reads: string[] = [];
    database.prepare = ((sql: string) => {
      if (/^\s*SELECT/i.test(sql)) reads.push(sql);
      return prepare(sql);
    }) as typeof database.prepare;
    for (const method of ["getSnapshot", "getSnapshotInfo"] as const) {
      for (const revision of [undefined, 3]) {
        reads.length = 0;
        await adapter[method](context, unitID, revision === undefined ? {} : { revision });
        assert.equal(reads.length, 1);
        const plan = prepare(`EXPLAIN QUERY PLAN ${reads[0]}`)
          .all(unitID, ...(revision === undefined ? [] : [revision])) as { detail: string }[];
        assert.equal(plan.some(({ detail }) => /SCAN |TEMP B-TREE/.test(detail)), false);
      }
    }
    for (const to of [undefined, 3]) {
      reads.length = 0;
      await adapter.getChangesets(context, unitID, { from: 1, ...(to === undefined ? {} : { to }) });
      assert.equal(reads.length, 1);
      const plan = prepare(`EXPLAIN QUERY PLAN ${reads[0]}`)
        .all(1, ...(to === undefined ? [] : [to]), unitID) as { detail: string }[];
      const range = plan.find(({ detail }) => detail.includes("SEARCH c "))?.detail ?? "";
      assert.ok(range.includes("revision>?"));
      assert.equal(range.includes("revision<?"), to !== undefined);
      assert.equal(plan.some(({ detail }) => /SCAN |TEMP B-TREE/.test(detail)), false);
    }
  } finally {
    await adapter.dispose();
  }
});
