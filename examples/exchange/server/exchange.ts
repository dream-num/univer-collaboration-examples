import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import express, { type Router } from "express";
import multer from "multer";
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
  UnitSnapshotMaterializer,
  type IUniverCollabService,
} from "@univerjs-pro/collaboration-service";
import { ErrorCode, UniverType, type IError } from "@univerjs/protocol";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const OK = protocolError(ErrorCode.OK, "");

interface StoredFile {
  readonly data: Buffer;
  readonly fileName: string;
  readonly contentType: string;
}

interface ImportRequest {
  readonly fileID?: unknown;
  readonly outputType?: unknown;
  readonly options?: {
    readonly sheet?: {
      readonly minSheetRowCount?: unknown;
      readonly minSheetColumnCount?: unknown;
    };
  };
}

interface ExportRequest {
  readonly unitID?: unknown;
  readonly type?: unknown;
  readonly format?: unknown;
  readonly options?: {
    readonly sheet?: {
      readonly csv?: { readonly sheetId?: unknown };
    };
  };
}

type TaskResult =
  | {
      readonly kind: "import";
      readonly import: { outputType: 1; unitID: string; jsonID: "" };
    }
  | {
      readonly kind: "export";
      readonly export: { fileID: string; fileUrl: string };
    };

type ExchangeTask =
  | { readonly status: "pending" }
  | { readonly status: "done"; readonly result: TaskResult }
  | { readonly status: "failed"; readonly error: IError };

export interface ExchangeRouterOptions {
  readonly service: IUniverCollabService;
  readonly userID: string;
}

export function createExchangeRouter(options: ExchangeRouterOptions): Router {
  const { service, userID } = options;
  const files = new Map<string, StoredFile>();
  const tasks = new Map<string, ExchangeTask>();
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  router.post("/stream/file/upload", upload.single("file"), (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: protocolError(ErrorCode.UNDEFINED, "file is required") });
      return;
    }
    const fileID = randomUUID();
    files.set(fileID, {
      data: request.file.buffer,
      fileName: basename(request.file.originalname) || "upload.bin",
      contentType: request.file.mimetype || "application/octet-stream",
    });
    response.json({ FileId: fileID, error: OK });
  });

  router.post(
    "/exchange/:type/import",
    express.json({ limit: "64kb" }),
    (request, response) => {
      try {
        requireSheetType(request.params.type);
        const body = request.body as ImportRequest;
        const fileID = requireString(body.fileID, "fileID");
        if (body.outputType !== 1) {
          throw new Error("This example only imports files as collaborative Units");
        }
        const file = files.get(fileID);
        if (!file) throw new Error("Uploaded file was not found");

        const taskID = startTask(tasks, async () => {
          const unitID = randomUUID();
          const imported = await importBufferToSnapshot(file.data, {
            type: UniverInstanceType.UNIVER_SHEET,
            fileName: file.fileName,
            unitId: unitID,
            ...positiveIntegerOption(
              "minSheetRowCount",
              body.options?.sheet?.minSheetRowCount,
            ),
            ...positiveIntegerOption(
              "minSheetColumnCount",
              body.options?.sheet?.minSheetColumnCount,
            ),
          });
          const snapshot = {
            ...imported.snapshot,
            unitID,
            type: UniverType.UNIVER_SHEET,
            rev: 1,
          };
          const created = await service.createUnitFromSnapshot(
            { snapshot, sheetBlocks: [...imported.sheetBlocks] },
            { userID },
          );
          if (created.status !== "created") {
            throw new Error("Imported Unit ID already exists");
          }
          files.delete(fileID);
          return {
            kind: "import",
            import: { outputType: 1, unitID, jsonID: "" },
          };
        });
        response.json({ taskID, error: OK });
      } catch (error) {
        response.status(400).json({
          taskID: "",
          error: protocolError(ErrorCode.UNDEFINED, errorMessage(error)),
        });
      }
    },
  );

  router.post(
    "/exchange/:type/export",
    express.json({ limit: "64kb" }),
    (request, response) => {
      try {
        requireSheetType(request.params.type);
        const body = request.body as ExportRequest;
        const unitID = requireString(body.unitID, "unitID");
        if (body.type !== UniverInstanceType.UNIVER_SHEET) {
          throw new Error("Only Sheet export is supported by this example");
        }
        const format = requireExportFormat(body.format);
        const sheetID = optionalString(body.options?.sheet?.csv?.sheetId);

        const taskID = startTask(tasks, async () => {
          const snapshot = await captureCurrentSnapshot(service, userID, unitID);
          const exportOptions = createExportOptions(format, sheetID, snapshot);
          const data = await exportSnapshotToBuffer(snapshot, exportOptions);
          const fileID = randomUUID();
          files.set(fileID, {
            data,
            fileName: `${unitID}.${format}`,
            contentType: contentTypeFor(format),
          });
          return {
            kind: "export",
            export: {
              fileID,
              fileUrl: `/universer-api/file/${fileID}/download`,
            },
          };
        });
        response.json({ taskID, error: OK });
      } catch (error) {
        response.status(400).json({
          taskID: "",
          error: protocolError(ErrorCode.UNDEFINED, errorMessage(error)),
        });
      }
    },
  );

  router.get("/exchange/task/:taskID", (request, response) => {
    const task = tasks.get(request.params.taskID);
    if (!task) {
      response.status(404).json({
        taskID: request.params.taskID,
        status: "failed",
        error: protocolError(ErrorCode.UNDEFINED, "Exchange task was not found"),
      });
      return;
    }
    if (task.status === "pending") {
      response.json({ taskID: request.params.taskID, status: "pending", error: OK });
      return;
    }
    if (task.status === "failed") {
      response.json({ taskID: request.params.taskID, status: "failed", error: task.error });
      return;
    }
    response.json({
      taskID: request.params.taskID,
      status: "done",
      error: OK,
      ...(task.result.kind === "import"
        ? { import: task.result.import }
        : { export: task.result.export }),
    });
  });

  router.get("/file/:fileID/sign-url", (request, response) => {
    const file = files.get(request.params.fileID);
    if (!file) {
      response.status(404).json({
        url: "",
        error: protocolError(ErrorCode.UNDEFINED, "Exchange file was not found"),
      });
      return;
    }
    response.json({
      url: `/universer-api/file/${request.params.fileID}/download`,
      error: OK,
    });
  });

  router.get("/file/:fileID/download", (request, response) => {
    const file = files.get(request.params.fileID);
    if (!file) {
      response.sendStatus(404);
      return;
    }
    response
      .type(file.contentType)
      .set("Content-Disposition", `attachment; filename="${file.fileName}"`)
      .send(file.data);
  });

  return router;
}

async function captureCurrentSnapshot(
  service: IUniverCollabService,
  userID: string,
  unitID: string,
): Promise<ISnapshotWithBlocks> {
  const loadData = await service.getUnitLoadDataWithBlocks(
    { unitID, type: UniverType.UNIVER_SHEET, revision: 0 },
    { userID },
  );
  const materializer = new UnitSnapshotMaterializer();
  try {
    return await materializer.materializeSnapshot(loadData);
  } finally {
    await materializer.dispose();
  }
}

function startTask(
  tasks: Map<string, ExchangeTask>,
  operation: () => Promise<TaskResult>,
): string {
  const taskID = randomUUID();
  tasks.set(taskID, { status: "pending" });
  void operation().then(
    (result) => tasks.set(taskID, { status: "done", result }),
    (error: unknown) =>
      tasks.set(taskID, {
        status: "failed",
        error: protocolError(ErrorCode.INTERNAL_ERROR, errorMessage(error)),
      }),
  );
  return taskID;
}

function createExportOptions(
  format: ExchangeFormat.XLSX | ExchangeFormat.CSV | ExchangeFormat.TSV,
  sheetID: string | undefined,
  snapshot: ISnapshotWithBlocks,
): ExportOptions {
  if (format === ExchangeFormat.XLSX) {
    return {
      type: UniverInstanceType.UNIVER_SHEET,
      format,
      formulaCalculation: FormulaCalculationMode.WHEN_EMPTY,
    };
  }
  const worksheetId = sheetID ?? firstSheetID(snapshot);
  if (!worksheetId) throw new Error("CSV/TSV export requires a worksheet ID");
  return {
    type: UniverInstanceType.UNIVER_SHEET,
    format,
    csv: { worksheetId },
  };
}

function firstSheetID(snapshot: ISnapshotWithBlocks): string | undefined {
  const workbook = snapshot.snapshot.workbook as
    | { readonly sheets?: Readonly<Record<string, unknown>> }
    | undefined;
  return workbook?.sheets ? Object.keys(workbook.sheets)[0] : undefined;
}

function requireSheetType(value: string | undefined): void {
  if (Number(value) !== UniverInstanceType.UNIVER_SHEET) {
    throw new Error("Only Sheet exchange is supported by this example");
  }
}

function requireExportFormat(
  value: unknown,
): ExchangeFormat.XLSX | ExchangeFormat.CSV | ExchangeFormat.TSV {
  if (
    value === ExchangeFormat.XLSX ||
    value === ExchangeFormat.CSV ||
    value === ExchangeFormat.TSV
  ) {
    return value;
  }
  throw new Error("Export format must be xlsx, csv, or tsv");
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function positiveIntegerOption(
  name: "minSheetRowCount" | "minSheetColumnCount",
  value: unknown,
): Partial<Record<typeof name, number>> {
  return Number.isSafeInteger(value) && Number(value) > 0
    ? { [name]: Number(value) }
    : {};
}

function contentTypeFor(format: ExchangeFormat): string {
  if (format === ExchangeFormat.XLSX) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "text/plain; charset=utf-8";
}

function protocolError(code: ErrorCode, message: string): IError {
  return { code, message };
}

function errorMessage(error: unknown): string {
  if (error instanceof ExchangeError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
