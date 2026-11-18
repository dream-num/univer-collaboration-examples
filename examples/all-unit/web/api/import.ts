import { ErrorCode, FileSource, UniverType } from "@univerjs/protocol";

const API_PREFIX = "/universer-api";
const IMPORT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 750;
const UNIT_OUTPUT_TYPE = 1;

const spreadsheetTypes = Object.freeze([UniverType.UNIVER_SHEET, UniverType.UNIVER_BASE]);
const documentTypes = Object.freeze([UniverType.UNIVER_DOC]);
const presentationTypes = Object.freeze([UniverType.UNIVER_SLIDE]);
const pdfTypes = Object.freeze([UniverType.UNIVER_PDF]);
const noTypes: readonly UniverType[] = Object.freeze([]);
const importTypes: Readonly<Record<string, readonly UniverType[]>> = {
  xls: spreadsheetTypes,
  xlsx: spreadsheetTypes,
  csv: spreadsheetTypes,
  tsv: spreadsheetTypes,
  doc: documentTypes,
  docx: documentTypes,
  ppt: presentationTypes,
  pptx: presentationTypes,
  pdf: pdfTypes,
};

export const IMPORT_ACCEPT = Object.keys(importTypes).map((extension) => `.${extension}`).join(",");

export function getImportTypes(fileName: string): readonly UniverType[] {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return noTypes;
  const extension = fileName.slice(dot + 1).toLowerCase();
  return Object.hasOwn(importTypes, extension) ? importTypes[extension] : noTypes;
}

// The import belongs to the page, so changing or disposing an editor does not cancel it.
// Aborting stops this client's requests and polling; the server may still finish its task.
export async function importUnit(
  file: File,
  type: UniverType,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  options.signal?.throwIfAborted();
  if (!getImportTypes(file.name).includes(type)) {
    throw new Error(`Cannot import "${file.name}" as the selected Unit type.`);
  }

  const controller = new AbortController();
  const cancel = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException(
    "Import timed out. The server may still finish it; check the Unit list before importing again.",
    "TimeoutError",
  )), IMPORT_TIMEOUT_MS);
  const { signal } = controller;

  try {
    const body = new FormData();
    body.append("file", file);
    const query = new URLSearchParams({
      size: String(file.size),
      source: String(FileSource.HttpImport),
      flate: "false",
    });
    const uploaded = await request(
      `${API_PREFIX}/stream/file/upload?${query}`,
      { method: "POST", body, signal },
      "File upload",
    );
    const fileID = requiredString(uploaded.FileId, "The upload response did not include a FileId.");

    const created = await request(
      `${API_PREFIX}/exchange/${type}/import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileID, outputType: UNIT_OUTPUT_TYPE }),
        signal,
      },
      "Starting import",
    );
    const taskID = requiredString(created.taskID, "The import response did not include a taskID.");

    while (true) {
      const task = await request(
        `${API_PREFIX}/exchange/task/${encodeURIComponent(taskID)}`,
        { signal },
        "Checking import",
      );
      if (task.taskID !== taskID) throw new Error("The server returned a different import task.");
      if (task.status === "done") {
        if (!isRecord(task.import) || task.import.outputType !== UNIT_OUTPUT_TYPE) {
          throw new Error("The import completed without creating a Unit.");
        }
        return requiredString(task.import.unitID, "The completed import did not include a unitID.");
      }
      if (task.status !== "pending") {
        throw new Error(task.status === "failed" ? "Import failed." : "The server returned an invalid import status.");
      }
      await waitForNextPoll(signal);
    }
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancel);
  }
}

async function request(url: string, init: RequestInit, operation: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error(response.ok
      ? `${operation} returned an invalid response.`
      : `${operation} failed (HTTP ${response.status}).`);
  }

  const error = isRecord(result) && isRecord(result.error) ? result.error : undefined;
  const message = typeof error?.message === "string" && error.message.trim() ? error.message : undefined;
  if (!response.ok) throw new Error(message ?? `${operation} failed (HTTP ${response.status}).`);
  if (!isRecord(result) || typeof error?.code !== "number") {
    throw new Error(`${operation} returned an invalid response.`);
  }
  // Exchange returns HTTP 200 for domain failures, including failures reported by task polling.
  if (error.code !== ErrorCode.OK) {
    throw new Error(message ?? `${operation} failed (code ${error.code}).`);
  }
  return result;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, POLL_INTERVAL_MS);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
