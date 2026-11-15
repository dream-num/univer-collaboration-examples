import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabService, type CreateUnitDatabaseInput, type DatabaseContext } from "@univerjs-pro/collaboration-service";
import { UniverType, type ISnapshot } from "@univerjs/protocol";
import { initializeUnitMetadata } from "../unit-metadata.ts";
import { UnitCatalog } from "./unit-catalog.ts";

const context: DatabaseContext = {
  userID: "catalog-test-user",
  customData: Object.create(null),
  request: {},
};

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "all-unit-catalog-"));
  const filename = join(directory, "all-unit.sqlite");
  const database = new SQLiteDatabaseAdapter({ filename });
  const catalog = new UnitCatalog(filename);
  const service = new UniverCollabService({
    dbAdapter: database,
    runtime: { execution: { mode: "in-process" } },
    snapshotPolicy: false,
  });
  service.use("createUnit", initializeUnitMetadata);
  t.after(async () => {
    await service.dispose();
    catalog.dispose();
    await database.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  return { database, catalog, service, filename };
}

function unit(unitID: string, type = UniverType.UNIVER_DOC, name = "Snapshot name"): CreateUnitDatabaseInput {
  const meta = { unitID, rev: 1, creator: context.userID, name, resources: [], originalMeta: new Uint8Array() };
  const snapshot: ISnapshot = { unitID, type, rev: 1, workbook: undefined, doc: undefined, slide: undefined, board: undefined };
  switch (type) {
    case UniverType.UNIVER_SHEET:
    case UniverType.UNIVER_BASE: snapshot.workbook = { ...meta, sheetOrder: [], sheets: {}, blockMeta: {} }; break;
    case UniverType.UNIVER_DOC: snapshot.doc = meta; break;
    case UniverType.UNIVER_SLIDE: snapshot.slide = meta; break;
    case UniverType.UNIVER_BOARD: snapshot.board = meta; break;
    case UniverType.UNIVER_PDF: snapshot.pdf = meta; break;
  }
  return {
    record: {
      unitID, type, headRevision: 1, creatorID: context.userID, createdAt: 1_700_000_000_123,
      metadata: { name, origin: "create" },
    },
    snapshot,
  };
}

test("lists saved Unit metadata and exposes only the sidebar fields", async t => {
  const { database, catalog, service } = await fixture(t);
  const input = unit("created-unit");
  const metadata = { name: "  Product roadmap  ", origin: "create", privateBusinessID: "internal-only" };
  await service.createUnitFromSnapshot({ snapshot: input.snapshot, metadata }, context);

  const saved = await database.getUnit(context, input.record.unitID);
  assert(saved);
  assert.deepEqual(saved.metadata, { ...metadata, name: "Product roadmap" });
  assert.equal(metadata.name, "  Product roadmap  ", "middleware edits the Service draft rather than caller input");
  const summary = {
    unitId: saved.unitID, type: saved.type, name: "Product roadmap", origin: "create", createdAt: saved.createdAt,
  };
  assert.deepEqual(catalog.getUnitSummary(saved.unitID), summary);
  assert.deepEqual(catalog.listUnits(), [summary]);
});

test("lists a Unit with empty metadata by ID and leaves its origin unknown", async t => {
  const { database, catalog } = await fixture(t);
  const { record, snapshot } = unit("existing-unit");
  await database.createUnit(context, { record: { ...record, metadata: {} }, snapshot });
  assert.deepEqual(catalog.listUnits(), [{
    unitId: record.unitID, type: record.type, name: record.unitID, origin: null, createdAt: record.createdAt,
  }]);
});

test("duplicate creation keeps the original metadata and a single catalog entry", async t => {
  const { database, catalog, service } = await fixture(t);
  const { snapshot, record } = unit("duplicate-unit");
  await service.createUnitFromSnapshot({ snapshot, metadata: { name: "Original", origin: "seed" } }, context);
  const result = await service.createUnitFromSnapshot({
    snapshot, metadata: { name: "Replacement", origin: "import" },
  }, context);
  assert.equal(result.status, "already-exists");
  assert.deepEqual((await database.getUnit(context, record.unitID))?.metadata, { name: "Original", origin: "seed" });
  assert.equal(catalog.listUnits().length, 1);
  assert.equal(catalog.getUnitSummary(record.unitID)?.name, "Original");
});

test("the catalog follows deletion and recovery without losing display metadata", async t => {
  const { database, catalog, service } = await fixture(t);
  const { snapshot, record } = unit("lifecycle-unit");
  const metadata = { name: "Roadmap", origin: "import" };
  await service.createUnitFromSnapshot({ snapshot, metadata }, context);
  await service.deleteUnits({ unitIDs: [record.unitID] }, context);
  assert.deepEqual(catalog.listUnits(), []);
  assert.equal(catalog.getUnitSummary(record.unitID), null);

  await service.recoverUnits({ unitIDs: [record.unitID] }, context);
  assert.equal(catalog.listUnits().length, 1);
  assert.equal(catalog.getUnitSummary(record.unitID)?.name, metadata.name);
  assert.deepEqual((await database.getUnit(context, record.unitID))?.metadata, metadata);

  await service.deleteUnits({ unitIDs: [record.unitID], hardDelete: true }, context);
  assert.deepEqual(catalog.listUnits(), []);
  assert.equal(catalog.getUnitSummary(record.unitID), null);
});

test("persists the catalog across reopening and lists newest Units first", async t => {
  const { database, catalog, service, filename } = await fixture(t);
  const older = unit("older-unit");
  const newer = unit("newer-unit");
  await database.createUnit(context, older);
  await database.createUnit(context, { ...newer, record: { ...newer.record, createdAt: newer.record.createdAt + 10 } });
  await service.dispose();
  catalog.dispose();
  await database.dispose();

  const reopened = new UnitCatalog(filename);
  try {
    assert.deepEqual(reopened.listUnits().map(item => item.unitId), ["newer-unit", "older-unit"]);
    assert.equal(reopened.getUnitSummary(older.record.unitID)?.name, "Snapshot name");
  } finally {
    reopened.dispose();
  }
});

test("persists import and attachment display details without persisting call-level objects", async t => {
  const { database, catalog, service } = await fixture(t);
  for (const origin of ["import", "attachment"] as const) {
    const { snapshot, record } = unit(`${origin}-unit`);
    const customData = { allUnitCreation: { name: `  ${origin} file  `, origin }, localService: () => "not JSON" };
    await service.createUnitFromSnapshot({ snapshot }, { userID: context.userID, customData });
    assert.deepEqual((await database.getUnit(context, record.unitID))?.metadata, { name: `${origin} file`, origin });
    assert.equal(catalog.getUnitSummary(record.unitID)?.origin, origin);
    assert.equal(customData.allUnitCreation.name, `  ${origin} file  `);
    assert.equal(typeof customData.localService, "function");
  }
});

test("uses snapshot names for all Unit types and a default for unnamed Units", async t => {
  const { catalog, service } = await fixture(t);
  for (const type of [UniverType.UNIVER_SHEET, UniverType.UNIVER_DOC, UniverType.UNIVER_SLIDE, UniverType.UNIVER_BOARD, UniverType.UNIVER_BASE, UniverType.UNIVER_PDF]) {
    const { snapshot, record } = unit(`type-${type}`, type, `Name ${type}`);
    await service.createUnitFromSnapshot({ snapshot }, context);
    assert.equal(catalog.getUnitSummary(record.unitID)?.name, `Name ${type}`);
    assert.equal(catalog.getUnitSummary(record.unitID)?.origin, "create");
  }
  const { snapshot, record } = unit("unnamed-unit", UniverType.UNIVER_DOC, " ");
  await service.createUnitFromSnapshot({ snapshot }, context);
  assert.equal(catalog.getUnitSummary(record.unitID)?.name, "Untitled document");
});
