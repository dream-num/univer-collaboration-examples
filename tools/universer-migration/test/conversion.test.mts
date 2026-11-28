// Unit tests for the pure conversion rules: changesets, snapshots, file references and block reuse.
import { UniverType } from "@univerjs/protocol";
import { describe, expect, it } from "vitest";
import { parseBooleanEnv, validateConfig, type MigrationConfig } from "../src/config.js";
import type { SourceUnitRow } from "../src/model.js";
import { createS3Client } from "../src/s3.js";
import { assertContiguous, toChangesetRecord } from "../src/source/changeset-converter.js";
import { collectFileIDs } from "../src/source/file-references.js";
import { buildPdfSnapshot, buildSheetBlock, buildWorkbookSnapshot, orderResources } from "../src/source/snapshot-builder.js";
import type { ChangesetRow } from "../src/source/universer-database.js";
import { BlockDeduper } from "../src/target/block-dedupe.js";

const decoder = new TextDecoder();

const unit: SourceUnitRow = {
  unitID: "unit-1",
  type: UniverType.UNIVER_SHEET,
  creator: "alice",
  name: "Ledger",
  createdAtMs: 1_000,
  deletedAtMs: null,
  purgeStatus: "",
  customerIdempotencyKey: null,
  customerMetaData: "",
};

function changesetRow(overrides: Partial<ChangesetRow> = {}): ChangesetRow {
  return {
    revision: 3,
    baseRev: 1,
    type: UniverType.UNIVER_SHEET,
    userID: "bob",
    mutations: [{ id: "sheet.mutation.set-range-values", data: '{"cellValue":{}}' }],
    sid: "session-1",
    reqID: 2,
    createdAtMs: 1_795_684_937_976,
    ...overrides,
  };
}

describe("toChangesetRecord", () => {
  it("chains the base revision, because Universer keeps the client's original base", () => {
    expect(toChangesetRecord("unit-1", UniverType.UNIVER_SHEET, changesetRow()).baseRev).toBe(2);
  });

  it("keeps mutation data as the serialized string", () => {
    const record = toChangesetRecord("unit-1", UniverType.UNIVER_SHEET, changesetRow());
    expect(record.mutations).toEqual([{ id: "sheet.mutation.set-range-values", data: '{"cellValue":{}}' }]);
  });

  it("writes an empty memberID and the creation time in seconds", () => {
    const record = toChangesetRecord("unit-1", UniverType.UNIVER_SHEET, changesetRow());
    expect(record.memberID).toBe("");
    expect(record.createTime).toBe(1_795_684_937);
  });

  it("gives server-written changesets a per-revision sid", () => {
    const record = toChangesetRecord("unit-1", UniverType.UNIVER_SHEET, changesetRow({ sid: "", reqID: 1 }));
    expect(record.sid).toBe("universer-server-3");
    expect(record.reqId).toBe(1);
  });

  it("rejects mutations that are not { id, data } strings", () => {
    const row = changesetRow({ mutations: [{ id: "x", data: { parsed: true } }] });
    expect(() => toChangesetRecord("unit-1", UniverType.UNIVER_SHEET, row)).toThrow(/not \{ id, data \}/);
  });
});

describe("assertContiguous", () => {
  it("accepts revisions without gaps", () => {
    expect(() => assertContiguous([changesetRow({ revision: 2 }), changesetRow({ revision: 3 })], 2)).not.toThrow();
  });

  it("rejects a gap", () => {
    expect(() => assertContiguous([changesetRow({ revision: 2 }), changesetRow({ revision: 4 })], 2)).toThrow(/expected revision 3/);
  });
});

describe("snapshot builder", () => {
  it("keeps the order of the resource references and skips missing resources", () => {
    const resources = orderResources(
      ["r2", "missing", "r1"],
      [
        { resourceID: "r1", name: "A", data: "1" },
        { resourceID: "r2", name: "B", data: "" },
      ],
    );
    expect(resources).toEqual([
      { id: "r2", name: "B", data: "" },
      { id: "r1", name: "A", data: "1" },
    ]);
  });

  it("fills name and creator from the unit row and encodes metadata as JSON bytes", () => {
    const snapshot = buildWorkbookSnapshot(
      unit,
      {
        revision: 50,
        snapshotID: "s",
        sheetOrder: ["sheet-1"],
        blockIDsBySheet: { "sheet-1": ["b1"] },
        resourceIDs: [],
        originalMeta: { locale: "zhCN" },
      },
      [{ sheetID: "sheet-1", type: 0, name: "Sheet1", rowCount: 10, columnCount: 5, originalMeta: {} }],
      [],
    );
    expect(snapshot.workbook?.name).toBe("Ledger");
    expect(snapshot.workbook?.creator).toBe("alice");
    expect(snapshot.workbook?.blockMeta).toEqual({ "sheet-1": { sheetID: "sheet-1", blocks: ["b1"] } });
    expect(JSON.parse(decoder.decode(snapshot.workbook?.originalMeta))).toEqual({ locale: "zhCN" });
  });

  it("fails when a sheet in the order has no worksheet row", () => {
    const row = { revision: 1, snapshotID: "s", sheetOrder: ["gone"], blockIDsBySheet: {}, resourceIDs: [], originalMeta: {} };
    expect(() => buildWorkbookSnapshot(unit, row, [], [])).toThrow(/no worksheet rows/);
  });

  it("decodes the base64 originalMeta of a protojson PdfMeta", () => {
    const pdfUnit = { ...unit, type: UniverType.UNIVER_PDF };
    const snapshot = buildPdfSnapshot(pdfUnit, {
      revision: 1,
      resourceIDs: [],
      originalMeta: { rev: 1, unitID: "unit-1", originalMeta: Buffer.from('{"a":1}').toString("base64") },
    });
    expect(decoder.decode(snapshot.pdf?.originalMeta)).toBe('{"a":1}');
    expect(snapshot.pdf?.name).toBe("Ledger");
  });

  it("treats an empty block object as {}", () => {
    expect(decoder.decode(buildSheetBlock("b", 0, 9, new Uint8Array()).data)).toBe("{}");
  });
});

describe("collectFileIDs", () => {
  it("finds imported images in resources and mutations, and PDF file fields", () => {
    const drawing = JSON.stringify({ s1: { data: { d1: { imageSourceType: "UUID", source: "file-1" } } } });
    const inline = JSON.stringify({ d2: { imageSourceType: "URL", source: "data:image/png;base64,AAAA" } });
    const ids = collectFileIDs(
      [
        {
          unitID: "u",
          type: UniverType.UNIVER_SHEET,
          rev: 1,
          workbook: {
            unitID: "u",
            rev: 1,
            name: "",
            creator: "",
            sheetOrder: [],
            sheets: {},
            blockMeta: {},
            resources: [{ name: "SHEET_DRAWING_PLUGIN", data: drawing }, { name: "OTHER", data: inline }],
            originalMeta: new Uint8Array(),
          },
          doc: undefined,
          slide: undefined,
          board: undefined,
        },
        {
          unitID: "p",
          type: UniverType.UNIVER_PDF,
          rev: 1,
          workbook: undefined,
          doc: undefined,
          slide: undefined,
          board: undefined,
          pdf: { unitID: "p", rev: 1, name: "", creator: "", sourcePdfFileId: "file-3", originalMeta: new Uint8Array() },
        },
      ],
      [
        {
          unitID: "u",
          type: UniverType.UNIVER_SHEET,
          baseRev: 1,
          revision: 2,
          userID: "",
          memberID: "",
          mutations: [{ id: "sheet.mutation.set-drawing-apply", data: JSON.stringify({ op: { imageSourceType: "UUID", source: "file-2" } }) }],
          metadata: {},
        },
      ],
    );
    expect(ids).toEqual(["file-1", "file-2", "file-3"]);
  });
});

describe("BlockDeduper", () => {
  const block = (id: string, text: string) => buildSheetBlock(id, 0, 9, new TextEncoder().encode(text));
  const snapshotWith = (rev: number, ids: string[]) => ({
    unitID: "u",
    type: UniverType.UNIVER_SHEET,
    rev,
    workbook: {
      unitID: "u",
      rev,
      name: "",
      creator: "",
      sheetOrder: ["s"],
      sheets: {},
      resources: [],
      blockMeta: { s: { sheetID: "s", blocks: ids } },
      originalMeta: new Uint8Array(),
    },
    doc: undefined,
    slide: undefined,
    board: undefined,
  });

  it("reuses the first ID for identical content and keeps changed blocks", () => {
    const deduper = new BlockDeduper();
    deduper.dedupe({ snapshot: snapshotWith(1, ["a1", "a2"]), sheetBlocks: [block("a1", "same"), block("a2", "old")] });
    const second = deduper.dedupe({ snapshot: snapshotWith(50, ["b1", "b2"]), sheetBlocks: [block("b1", "same"), block("b2", "new")] });
    expect(second.snapshot.workbook?.blockMeta["s"]?.blocks).toEqual(["a1", "b2"]);
    expect(second.sheetBlocks.map((b) => b.id)).toEqual(["a1", "b2"]);
  });
});

describe("S3 configuration", () => {
  it("parses boolean environment variables and rejects invalid values", () => {
    expect(parseBooleanEnv("UNIVERSER_S3_PATH_STYLE", undefined)).toBeUndefined();
    expect(parseBooleanEnv("UNIVERSER_S3_PATH_STYLE", "")).toBeUndefined();
    expect(parseBooleanEnv("UNIVERSER_S3_PATH_STYLE", "true")).toBe(true);
    expect(parseBooleanEnv("UNIVERSER_S3_PATH_STYLE", "1")).toBe(true);
    expect(parseBooleanEnv("UNIVERSER_S3_PATH_STYLE", "FALSE")).toBe(false);
    expect(parseBooleanEnv("UNIVERSER_S3_PATH_STYLE", "0")).toBe(false);
    expect(() => parseBooleanEnv("UNIVERSER_S3_PATH_STYLE", "yes")).toThrow(/must be true, false, 1 or 0/);
  });

  it("requires S3 access key ID and secret access key to be set together", () => {
    const baseConfig: MigrationConfig = {
      source: {
        databaseUrl: "postgres://localhost/univer",
        s3: { region: "us-east-1", bucket: "univer", forcePathStyle: false, accessKeyId: "only-id" },
      },
      target: {
        databaseUrl: "postgres://localhost/collab",
        s3: { region: "us-east-1", bucket: "collab", forcePathStyle: false },
      },
      unitIDs: [],
      concurrency: 4,
      dryRun: false,
      blockDedupe: true,
      verify: true,
      defaultCreatorID: "universer-migration",
      manifestPath: "manifest.jsonl",
    };
    expect(() => validateConfig(baseConfig)).toThrow(/Source S3 access key ID and secret access key must be set together/);
  });

  it("applies forcePathStyle and WHEN_REQUIRED checksums on S3Client", async () => {
    const virtualHosted = createS3Client({ region: "oss-cn-shenzhen", bucket: "univer", forcePathStyle: false });
    const pathStyle = createS3Client({
      region: "us-east-1",
      bucket: "univer",
      endpoint: "http://minio:9000",
      forcePathStyle: true,
    });
    try {
      expect(virtualHosted.config.forcePathStyle).toBe(false);
      expect(pathStyle.config.forcePathStyle).toBe(true);
      expect(await virtualHosted.config.requestChecksumCalculation()).toBe("WHEN_REQUIRED");
      expect(await virtualHosted.config.responseChecksumValidation()).toBe("WHEN_REQUIRED");
    } finally {
      virtualHosted.destroy();
      pathStyle.destroy();
    }
  });
});
