import { ErrorCode, FileSource, UniverType } from "@univerjs/protocol";

const API_PREFIX = "/universer-api";
const IMPORT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 750;
const UNIT_OUTPUT_TYPE = 1;

const importTypes: Readonly<Record<string, UniverType>> = {
  ".xls": UniverType.UNIVER_SHEET,
  ".xlsx": UniverType.UNIVER_SHEET,
  ".csv": UniverType.UNIVER_SHEET,
  ".tsv": UniverType.UNIVER_SHEET,
  ".doc": UniverType.UNIVER_DOC,
  ".docx": UniverType.UNIVER_DOC,
  ".ppt": UniverType.UNIVER_SLIDE,
  ".pptx": UniverType.UNIVER_SLIDE,
  ".pdf": UniverType.UNIVER_PDF,
};

export const IMPORT_ACCEPT = Object.keys(importTypes).join(",");

// The import belongs to the page, so changing or disposing an editor does not cancel it.
// Aborting stops this client's requests and polling; the server may still finish its task.
export async function importUnit(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<{ unitId: string; type: UniverType }> {
  options.signal?.throwIfAborted();
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const type = importTypes[extension];
  if (type === undefined) {
    throw new Error("This file format is not supported. Choose an Excel, CSV, TSV, Word, PowerPoint or PDF file.");
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
        return { unitId: unitID, type };
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
