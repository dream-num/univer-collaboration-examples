import { basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
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
import type { ExchangeTaskResult, PostgresExchangeStore } from "./exchange-store.js";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const OK = protocolError(ErrorCode.OK, "");

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

export interface ExchangeRouterOptions {
  readonly service: IUniverCollabService;
  readonly store: PostgresExchangeStore;
  readonly userID: string;
  /** Identifies the replica in logs. */
  readonly instanceID: string;
  /** Called after an import created a Unit, so the application can register it (here: the file catalog). */
  readonly onUnitImported: (unitID: string, name: string) => Promise<void>;
}

export interface ExchangeRouter {
  readonly router: Router;
  /** Resolves once the tasks running in this replica have been written back; used during shutdown. */
  waitForTasks(): Promise<void>;
}

/**
 * Implements the exchange protocol expected by `@univerjs-pro/exchange-client`.
 * Upload, task polling, and download go through the shared PostgreSQL store, so any replica
 * behind the gateway can answer them. Conversion runs inside the replica that accepted the
 * import or export request; production deployments hand it to a queue and separate workers.
 */
export function createExchangeRouter(options: ExchangeRouterOptions): ExchangeRouter {
  const { service, store, userID, instanceID, onUnitImported } = options;
  const materializer = new UnitSnapshotMaterializer();
  const runningTasks = new Set<Promise<void>>();
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    // Browsers send the file name as raw UTF-8; multer decodes it as latin1 unless told otherwise.
    defParamCharset: "utf8",
  });

  router.post("/stream/file/upload", upload.single("file"), async (request, response) => {
    if (!request.file) {
      response.status(400).json({ error: protocolError(ErrorCode.UNDEFINED, "file is required") });
      return;
    }
    const fileID = await store.saveFile({
      data: request.file.buffer,
      fileName: basename(request.file.originalname) || "upload.bin",
      contentType: request.file.mimetype || "application/octet-stream",
    });
    response.json({ FileId: fileID, error: OK });
  });

  router.post(
    "/exchange/:type/import",
    express.json({ limit: "64kb" }),
    async (request, response) => {
      try {
        requireSheetType(request.params.type);
        const body = request.body as ImportRequest;
        const fileID = requireString(body.fileID, "fileID");
        if (body.outputType !== 1) {
          throw new Error("This example only imports files as collaborative Units");
        }
        const fileName = await store.getFileName(fileID);
        if (fileName === null) throw new Error("Uploaded file was not found");

        const taskID = await startTask("import", async () => {
          const file = await store.getFile(fileID);
          if (!file) throw new Error("Uploaded file was not found");
          const unitID = randomUUID();
          const imported = await importBufferToSnapshot(file.data, {
            type: UniverInstanceType.UNIVER_SHEET,
            fileName: file.fileName,
            unitId: unitID,
            ...positiveIntegerOption("minSheetRowCount", body.options?.sheet?.minSheetRowCount),
            ...positiveIntegerOption("minSheetColumnCount", body.options?.sheet?.minSheetColumnCount),
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
          // Register the Unit with the application before the task completes so that the
          // link in the import notification already resolves to a listed file.
          await onUnitImported(unitID, displayName(file.fileName));
          // The upload has served its purpose; exports stay available for download.
          await store.deleteFile(fileID);
          return { import: { outputType: 1, unitID, jsonID: "" } };
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
    async (request, response) => {
      try {
        requireSheetType(request.params.type);
        const body = request.body as ExportRequest;
        const unitID = requireString(body.unitID, "unitID");
        if (body.type !== UniverInstanceType.UNIVER_SHEET) {
          throw new Error("Only Sheet export is supported by this example");
        }
        const format = requireExportFormat(body.format);
        const sheetID = optionalString(body.options?.sheet?.csv?.sheetId);

        const taskID = await startTask("export", async () => {
          const snapshot = await captureCurrentSnapshot(service, materializer, userID, unitID);
          const exportOptions = createExportOptions(format, sheetID, snapshot);
          const data = await exportSnapshotToBuffer(snapshot, exportOptions);
          const fileID = await store.saveFile({
            data,
            fileName: `${unitID}.${format}`,
            contentType: contentTypeFor(format),
          });
          return { export: { fileID, fileUrl: downloadPath(fileID) } };
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

  router.get("/exchange/task/:taskID", async (request, response) => {
    const task = await store.getTask(request.params.taskID);
    if (!task) {
      response.status(404).json({
        taskID: request.params.taskID,
        status: "failed",
        error: protocolError(ErrorCode.UNDEFINED, "Exchange task was not found"),
      });
      return;
    }
    if (task.status === "failed") {
      response.json({
        taskID: task.taskID,
        status: "failed",
        error: protocolError(ErrorCode.INTERNAL_ERROR, task.error ?? "Exchange task failed"),
      });
      return;
    }
    if (task.status !== "done" || !task.result) {
      // The client distinguishes only pending, done, and failed; "running" is pending to it.
      response.json({ taskID: task.taskID, status: "pending", error: OK });
      return;
    }
    response.json({ taskID: task.taskID, status: "done", error: OK, ...task.result });
  });

  router.get("/file/:fileID/sign-url", async (request, response) => {
    const fileName = await store.getFileName(request.params.fileID);
    if (fileName === null) {
      response.status(404).json({
        url: "",
        error: protocolError(ErrorCode.UNDEFINED, "Exchange file was not found"),
      });
      return;
    }
    response.json({ url: downloadPath(request.params.fileID), error: OK });
  });

  router.get("/file/:fileID/download", async (request, response) => {
    const file = await store.getFile(request.params.fileID);
    if (!file) {
      response.sendStatus(404);
      return;
    }
    response
      .type(file.contentType)
      .set("Content-Disposition", `attachment; filename="${file.fileName}"`)
      .send(file.data);
  });

  /**
   * Records the task as pending, then runs the conversion in this process and writes the
   * outcome back. Whichever replica receives the poll reads the same row.
   */
  async function startTask(kind: "import" | "export", operation: () => Promise<ExchangeTaskResult>): Promise<string> {
    const taskID = await store.createTask(kind);
    const run = (async () => {
      try {
        await store.startTask(taskID);
        const result = await operation();
        await store.completeTask(taskID, result);
        console.info(`[exchange ${instanceID}] task.done kind=${kind} taskID=${taskID}`);
      } catch (error) {
        const message = errorMessage(error);
        console.error(`[exchange ${instanceID}] task.failed kind=${kind} taskID=${taskID}: ${message}`);
        await store.failTask(taskID, message).catch((updateError: unknown) => {
          console.error(`[exchange ${instanceID}] task.update_failed taskID=${taskID}: ${errorMessage(updateError)}`);
        });
      }
    })();
    runningTasks.add(run);
    void run.finally(() => runningTasks.delete(run));
    return taskID;
  }

  return {
    router,
    waitForTasks: async () => {
      await Promise.allSettled(runningTasks);
    },
  };
}

async function captureCurrentSnapshot(
  service: IUniverCollabService,
  materializer: UnitSnapshotMaterializer,
  userID: string,
  unitID: string,
): Promise<ISnapshotWithBlocks> {
  // Reads the latest confirmed revision from the shared database; the collaboration node that
  // hosts the document does not need to be involved.
  const loadData = await service.getUnitLoadDataWithBlocks(
    { unitID, type: UniverType.UNIVER_SHEET, revision: 0 },
    { userID },
  );
  return materializer.materializeSnapshot(loadData);
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

/** Derives the catalog name from the uploaded file name, matching the 1–80 character rule of the file list. */
function displayName(fileName: string): string {
  const name = basename(fileName, extname(fileName)).trim().slice(0, 80);
  return name || "Imported Sheet";
}

function downloadPath(fileID: string): string {
  return `/universer-api/file/${fileID}/download`;
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
