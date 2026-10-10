import { randomUUID } from "node:crypto";
import { basename, extname } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  ExchangeError,
  ExchangeFormat,
  FormulaCalculationMode,
  exportSnapshotToBuffer,
  importBufferToSnapshot,
  type ExportOptions,
  type ISnapshotWithBlocks,
} from "@univerjs-pro/exchange-node";
import { UniverInstanceType } from "@univerjs/core";
import {
  ErrorCode,
  UnitAction,
  UniverType,
  type ISheetBlock,
  type ISnapshot,
} from "@univerjs/protocol";
import type { AppUnit } from "../../shared/api-types";
import { isUnitActionAllowed } from "../permissions";
import { contentTypeFor, exportFormats, importExtensions } from "./formats";

const OK = { code: ErrorCode.OK, message: "" } as const;

interface ExchangeArtifact {
  readonly userId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}

type ExchangeTask =
  | { readonly userId: string; readonly kind: "import"; readonly result: { outputType: 1 | 2; unitID: string; jsonID: string } }
  | { readonly userId: string; readonly kind: "export"; readonly result: { fileID: string; fileUrl: string } }
  | { readonly userId: string; readonly kind: "import" | "export"; readonly error: string };

export class ExchangeHttpError extends Error {
  constructor(
    readonly code:
      | "EXPORT_FAILED"
      | "FILE_NOT_FOUND"
      | "IMPORT_FAILED"
      | "PERMISSION_DENIED"
      | "UNSUPPORTED_EXPORT_FORMAT"
      | "UNSUPPORTED_IMPORT_FORMAT",
    readonly status: number,
    readonly detail?: string,
  ) {
    super(code);
  }
}

export function createExchangeService(options: {
  captureSnapshot: (input: {
    userId: string;
    unitId: string;
    type: UniverType;
  }) => Promise<ISnapshotWithBlocks>;
  importUnit: (input: {
    unitId: string;
    type: UniverType;
    name: string;
    creatorUserId: string;
    data: ISnapshotWithBlocks;
  }) => Promise<AppUnit>;
  getUnit: (userId: string, unitId: string) => AppUnit | undefined;
}) {
  const artifacts = new Map<string, ExchangeArtifact>();
  const tasks = new Map<string, ExchangeTask>();

  async function importFile(input: {
    userId: string;
    type: number;
    originalName: string;
    data: Buffer;
  }) {
    const extension = extname(input.originalName).slice(1).toLowerCase();
    if (!isExchangeType(input.type) || !importExtensions.get(input.type)?.has(extension))
      throw new ExchangeHttpError("UNSUPPORTED_IMPORT_FORMAT", 400);

    const unitId = randomUUID();
    try {
      const imported = await importSnapshot(input.data, input.originalName, unitId, input.type);
      const data: ISnapshotWithBlocks = {
        snapshot: { ...imported.snapshot, unitID: unitId, type: input.type, rev: 1 },
        sheetBlocks: [...imported.sheetBlocks],
      };
      const rawName = basename(input.originalName, extname(input.originalName)).trim();
      return await options.importUnit({
        unitId,
        type: input.type,
        name: (rawName || "Imported Unit").slice(0, 120),
        creatorUserId: input.userId,
        data,
      });
    } catch (error) {
      if (error instanceof ExchangeHttpError) throw error;
      throw new ExchangeHttpError("IMPORT_FAILED", 400, errorMessage(error));
    }
  }

  async function exportFile(input: {
    userId: string;
    unitId: string;
    format: string;
  }) {
    const unit = options.getUnit(input.userId, input.unitId);
    if (!unit || unit.state !== "active")
      throw new ExchangeHttpError("FILE_NOT_FOUND", 404);
    if (!isUnitActionAllowed(unit.role, UnitAction.Export))
      throw new ExchangeHttpError("PERMISSION_DENIED", 403);
    if (!exportFormats.get(unit.type)?.has(input.format))
      throw new ExchangeHttpError("UNSUPPORTED_EXPORT_FORMAT", 400);

    try {
      const snapshot = await options.captureSnapshot({
        userId: input.userId,
        unitId: unit.unitId,
        type: unit.type as UniverType,
      });
      const data = await exportSnapshotToBuffer(
        snapshot,
        createExportOptions(unit.type as UniverType, input.format, snapshot),
      );
      return {
        data,
        contentType: contentTypeFor(input.format),
        filename: `${safeDownloadName(unit.name)}.${input.format}`,
      };
    } catch (error) {
      if (error instanceof ExchangeHttpError) throw error;
      throw new ExchangeHttpError("EXPORT_FAILED", 400, errorMessage(error));
    }
  }

  function saveArtifact(artifact: ExchangeArtifact) {
    const id = randomUUID();
    artifacts.set(id, artifact);
    return id;
  }

  return {
    importFile,
    exportFile,

    uploadProtocolFile(input: {
      userId: string;
      originalName: string;
      contentType: string;
      data: Buffer;
      compressed: boolean;
    }) {
      const data = input.compressed ? inflateRawSync(input.data) : input.data;
      const fileID = saveArtifact({
        userId: input.userId,
        filename: input.originalName,
        contentType: input.contentType || "application/octet-stream",
        data,
      });
      return { FileId: fileID, error: OK };
    },

    async importProtocolFile(input: {
      userId: string;
      type: number;
      body: unknown;
    }) {
      const body = requireRecord(input.body);
      const fileID = requireString(body.fileID, "fileID");
      const outputType = body.outputType;
      if (outputType !== 1 && outputType !== 2)
        throw new ExchangeHttpError("IMPORT_FAILED", 400, "Invalid outputType");
      const artifact = artifacts.get(fileID);
      if (!artifact || artifact.userId !== input.userId)
        throw new ExchangeHttpError("FILE_NOT_FOUND", 404);

      const taskID = randomUUID();
      try {
        if (outputType === 1) {
          const unit = await importFile({
            userId: input.userId,
            type: input.type,
            originalName: artifact.filename,
            data: artifact.data,
          });
          tasks.set(taskID, {
            userId: input.userId,
            kind: "import",
            result: { outputType, unitID: unit.unitId, jsonID: "" },
          });
        } else {
          if (!isExchangeType(input.type))
            throw new ExchangeHttpError("UNSUPPORTED_IMPORT_FORMAT", 400);
          const unitId = randomUUID();
          const imported = await importSnapshot(artifact.data, artifact.filename, unitId, input.type);
          const json = Buffer.from(JSON.stringify(snapshotToProtocolJson({
            snapshot: { ...imported.snapshot, unitID: unitId, type: input.type, rev: 1 },
            sheetBlocks: [...imported.sheetBlocks],
          })));
          const jsonID = saveArtifact({
            userId: input.userId,
            filename: `${basename(artifact.filename, extname(artifact.filename))}.json`,
            contentType: "application/json",
            data: json,
          });
          tasks.set(taskID, {
            userId: input.userId,
            kind: "import",
            result: { outputType, unitID: "", jsonID },
          });
        }
      } catch (error) {
        tasks.set(taskID, {
          userId: input.userId,
          kind: "import",
          error: errorMessage(error),
        });
      }
      return { error: OK, taskID };
    },

    async exportProtocolFile(input: { userId: string; type: number; body: unknown }) {
      const body = requireRecord(input.body);
      const unitID = requireString(body.unitID, "unitID");
      const format = requireString(body.format, "format").toLowerCase();
      const taskID = randomUUID();
      try {
        const output = await exportFile({ userId: input.userId, unitId: unitID, format });
        const fileID = saveArtifact({
          userId: input.userId,
          filename: output.filename,
          contentType: output.contentType,
          data: Buffer.from(output.data),
        });
        tasks.set(taskID, {
          userId: input.userId,
          kind: "export",
          result: { fileID, fileUrl: "" },
        });
      } catch (error) {
        tasks.set(taskID, {
          userId: input.userId,
          kind: "export",
          error: errorMessage(error),
        });
      }
      return { error: OK, taskID };
    },

    getProtocolTask(userId: string, taskID: string) {
      const task = tasks.get(taskID);
      if (!task || task.userId !== userId)
        return { error: { code: 404, message: "Task not found" }, taskID, status: "failed" };
      if ("error" in task)
        return { error: { code: 500, message: task.error }, taskID, status: "failed" };
      return task.kind === "import"
        ? { error: OK, taskID, status: "done", import: task.result }
        : { error: OK, taskID, status: "done", export: task.result };
    },

    signProtocolFile(userId: string, fileID: string) {
      const artifact = artifacts.get(fileID);
      if (!artifact || artifact.userId !== userId) return undefined;
      return {
        error: OK,
        url: `/universer-api/file/${encodeURIComponent(fileID)}/content`,
        mode: 1,
      };
    },

    readProtocolFile(userId: string, fileID: string) {
      const artifact = artifacts.get(fileID);
      return artifact?.userId === userId ? artifact : undefined;
    },
  };
}

function snapshotToProtocolJson(input: ISnapshotWithBlocks) {
  const snapshot = structuredClone(input.snapshot);
  const workbook = snapshot.workbook as
    | {
        originalMeta?: Uint8Array | string;
        sheets?: Record<string, { originalMeta?: Uint8Array | string }>;
      }
    | undefined;
  if (workbook?.originalMeta instanceof Uint8Array)
    workbook.originalMeta = Buffer.from(workbook.originalMeta).toString("base64");
  for (const sheet of Object.values(workbook?.sheets ?? {})) {
    if (sheet.originalMeta instanceof Uint8Array)
      sheet.originalMeta = Buffer.from(sheet.originalMeta).toString("base64");
  }
  transformUnitMetaToBase64(snapshot);

  return {
    snapshot,
    sheetBlocks: Object.fromEntries(
      input.sheetBlocks.map((block) => [
        block.id,
        { ...block, data: Buffer.from(block.data).toString("base64") },
      ]),
    ) as unknown as Readonly<Record<string, ISheetBlock>>,
  };
}

function transformUnitMetaToBase64(snapshot: ISnapshot) {
  for (const key of ["doc", "slide", "board", "pdf"] as const) {
    const meta = snapshot[key] as
      | { originalMeta?: Uint8Array | string }
      | undefined;
    if (meta?.originalMeta instanceof Uint8Array)
      meta.originalMeta = Buffer.from(meta.originalMeta).toString("base64");
  }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ExchangeHttpError("IMPORT_FAILED", 400, "Invalid request body");
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value)
    throw new ExchangeHttpError("IMPORT_FAILED", 400, `${field} is required`);
  return value;
}

async function importSnapshot(
  data: Buffer,
  fileName: string,
  unitId: string,
  type: UniverType,
): Promise<ISnapshotWithBlocks> {
  switch (type) {
    case UniverType.UNIVER_SHEET:
      return importBufferToSnapshot(data, {
        type: UniverInstanceType.UNIVER_SHEET,
        fileName,
        unitId,
        minSheetRowCount: 100,
        minSheetColumnCount: 26,
      });
    case UniverType.UNIVER_DOC:
      return importBufferToSnapshot(data, {
        type: UniverInstanceType.UNIVER_DOC,
        fileName,
        unitId,
      });
    case UniverType.UNIVER_SLIDE:
      return importBufferToSnapshot(data, {
        type: UniverInstanceType.UNIVER_SLIDE,
        fileName,
        unitId,
      });
    case UniverType.UNIVER_BASE:
      return importBufferToSnapshot(data, {
        type: UniverInstanceType.UNIVER_BASE,
        fileName,
        unitId,
        minSheetRowCount: 100,
        minSheetColumnCount: 2,
      });
    default:
      throw new Error("Unsupported Unit type");
  }
}

function createExportOptions(
  type: UniverType,
  format: string,
  snapshot: ISnapshotWithBlocks,
): ExportOptions {
  const exchangeFormat = format as ExchangeFormat;
  switch (type) {
    case UniverType.UNIVER_SHEET:
      return format === "xlsx"
        ? {
            type: UniverInstanceType.UNIVER_SHEET,
            format: ExchangeFormat.XLSX,
            formulaCalculation: FormulaCalculationMode.WHEN_EMPTY,
          }
        : {
            type: UniverInstanceType.UNIVER_SHEET,
            format: exchangeFormat as ExchangeFormat.CSV | ExchangeFormat.TSV,
            csv: { worksheetId: firstSubUnitID(snapshot) },
          };
    case UniverType.UNIVER_DOC:
      return { type: UniverInstanceType.UNIVER_DOC, format: ExchangeFormat.DOCX };
    case UniverType.UNIVER_SLIDE:
      return { type: UniverInstanceType.UNIVER_SLIDE, format: ExchangeFormat.PPTX };
    case UniverType.UNIVER_BASE:
      return format === "xlsx"
        ? { type: UniverInstanceType.UNIVER_BASE, format: ExchangeFormat.XLSX }
        : {
            type: UniverInstanceType.UNIVER_BASE,
            format: exchangeFormat as ExchangeFormat.CSV | ExchangeFormat.TSV,
            csv: { tableId: firstSubUnitID(snapshot) },
          };
    default:
      throw new Error("Unsupported Unit type");
  }
}

function firstSubUnitID(snapshot: ISnapshotWithBlocks) {
  const workbook = snapshot.snapshot.workbook as
    | { sheets?: Readonly<Record<string, unknown>> }
    | undefined;
  const first = workbook?.sheets && Object.keys(workbook.sheets)[0];
  if (!first) throw new Error("CSV/TSV export requires a sheet or table");
  return first;
}

function isExchangeType(value: number): value is UniverType {
  return importExtensions.has(value);
}

function safeDownloadName(value: string) {
  return value.replace(/[\\/\r\n"<>:|?*]/g, "_").slice(0, 100) || "export";
}

function errorMessage(error: unknown) {
  if (error instanceof ExchangeError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

export type ExchangeService = ReturnType<typeof createExchangeService>;
