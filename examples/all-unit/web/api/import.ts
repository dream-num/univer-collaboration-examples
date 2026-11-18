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

  const timeout = AbortSignal.timeout(IMPORT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

  try {
    const body = new FormData();
    body.append("file", file);
    const query = new URLSearchParams({
      size: String(file.size),
      source: String(FileSource.HttpImport),
      flate: "false",
    });
    const uploaded = await request<{ FileId: string }>(
      `${API_PREFIX}/stream/file/upload?${query}`,
      { method: "POST", body, signal },
      "File upload",
    );
    const created = await request<{ taskID: string }>(
      `${API_PREFIX}/exchange/${type}/import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileID: uploaded.FileId, outputType: UNIT_OUTPUT_TYPE }),
        signal,
      },
      "Starting import",
    );
    while (true) {
      const task = await request<{ status: "pending" | "done" | "failed"; import?: { unitID: string } }>(
        `${API_PREFIX}/exchange/task/${encodeURIComponent(created.taskID)}`,
        { signal },
        "Checking import",
      );
      if (task.status === "done") {
        const unitID = task.import?.unitID;
        if (typeof unitID !== "string" || !unitID.trim()) throw new Error("The import completed without creating a Unit.");
        return unitID;
      }
      if (task.status !== "pending") {
        throw new Error(task.status === "failed" ? "Import failed." : "The server returned an invalid import status.");
      }
      await waitForNextPoll(signal);
    }
  } catch (error) {
    if (signal.aborted && signal.reason?.name === "TimeoutError") {
      throw new Error("Import timed out. The server may still finish it; check the Unit list before importing again.");
    }
    if (signal.aborted) throw signal.reason;
    throw error;
  }
}

async function request<T>(url: string, init: RequestInit, operation: string): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || `${operation} failed (HTTP ${response.status}).`);
  // Exchange returns HTTP 200 for domain failures, including failures reported by task polling.
  if (result.error?.code !== ErrorCode.OK) {
    throw new Error(result.error?.message || `${operation} failed.`);
  }
  return result as T;
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
