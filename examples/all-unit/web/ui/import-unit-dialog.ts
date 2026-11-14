import type { UniverType } from "@univerjs/protocol";
import { UNIT_TYPES } from "../../shared/units";
import { getImportTypes, IMPORT_ACCEPT, type ImportProgress } from "../api/import";
import { createDialog, errorMessage } from "./dialog";
import { icon, unitIcon } from "./icons";

interface ImportUnitDialogOptions {
  onImport(file: File, type: UniverType, options: {
    signal: AbortSignal;
    onProgress(progress: ImportProgress): void;
  }): Promise<void>;
}

export function createImportUnitDialog(options: ImportUnitDialogOptions) {
  const view = createDialog("import-unit", "Import a file", "Turn your file into a collaborative Unit.", "Import file");
  view.content.innerHTML = `
    <label class="au-field-label" for="import-unit-file">File</label>
    <div class="au-file-picker">
      <span class="au-upload-icon"></span>
      <input id="import-unit-file" class="au-file-input" type="file" />
      <p class="au-file-formats">Excel, CSV, Word, PowerPoint or PDF</p>
    </div>
    <p class="au-file-detail" hidden></p>
    <div class="au-import-target" hidden>
      <label class="au-field-label" for="import-unit-type">Import as</label>
      <select id="import-unit-type" class="au-select"></select>
      <p class="au-field-hint">Choose a spreadsheet or a structured database.</p>
    </div>
    <p class="au-import-type-label" hidden></p>
    <div class="au-import-progress" hidden>
      <p class="au-progress-label" role="status"></p>
      <progress class="au-progress" max="100" aria-label="Import progress"></progress>
      <p class="au-field-hint">You can stop waiting. An import already started on the server may still finish and appear in your units.</p>
    </div>
  `;
  view.content.querySelector(".au-upload-icon")!.append(icon("upload"));
  const input = view.content.querySelector<HTMLInputElement>("#import-unit-file")!;
  input.accept = IMPORT_ACCEPT;
  const target = view.content.querySelector<HTMLDivElement>(".au-import-target")!;
  const select = view.content.querySelector<HTMLSelectElement>("#import-unit-type")!;
  const typeLabel = view.content.querySelector<HTMLParagraphElement>(".au-import-type-label")!;
  const detail = view.content.querySelector<HTMLParagraphElement>(".au-file-detail")!;
  const progress = view.content.querySelector<HTMLDivElement>(".au-import-progress")!;
  const progressLabel = view.content.querySelector<HTMLParagraphElement>(".au-progress-label")!;
  const progressBar = view.content.querySelector<HTMLProgressElement>("progress")!;
  let file: File | undefined;
  let candidates: readonly UniverType[] = [];
  let busy = false;
  let disposed = false;
  let generation = 0;
  let controller: AbortController | undefined;

  function setBusy(value: boolean) {
    busy = value;
    view.form.setAttribute("aria-busy", String(value));
    view.submit.disabled = value || !file || candidates.length === 0;
    view.submit.textContent = value ? "Importing…" : "Import file";
    view.cancel.textContent = value ? "Stop waiting" : "Cancel";
    view.close.setAttribute("aria-label", value ? "Stop waiting and close dialog" : "Close dialog");
    input.disabled = value;
    select.disabled = value;
    progress.hidden = !value;
  }

  function close() {
    generation++;
    controller?.abort();
    controller = undefined;
    setBusy(false);
    view.dialog.close();
  }

  function showProgress(value: ImportProgress) {
    const percent = value.percent === undefined ? undefined : Math.max(0, Math.min(100, value.percent));
    progressLabel.textContent = value.stage === "converting"
      ? "Converting your file…"
      : percent === undefined ? "Uploading your file…" : `Uploading your file… ${Math.round(percent)}%`;
    if (value.stage === "uploading" && percent !== undefined) progressBar.value = percent;
    else progressBar.removeAttribute("value");
  }

  input.addEventListener("change", () => {
    file = input.files?.[0];
    candidates = file ? getImportTypes(file.name) : [];
    view.error.hidden = true;
    target.hidden = candidates.length < 2;
    typeLabel.hidden = candidates.length !== 1;
    detail.hidden = !file;
    detail.textContent = file ? `${file.name} · ${formatSize(file.size)}` : "";
    select.replaceChildren();
    for (const type of candidates) {
      const option = document.createElement("option");
      option.value = String(type);
      option.textContent = UNIT_TYPES.find(item => item.type === type)?.label ?? "Unit";
      select.append(option);
    }
    if (candidates.length === 1) {
      const type = candidates[0];
      typeLabel.replaceChildren(unitIcon(type), document.createTextNode(`Import as ${UNIT_TYPES.find(item => item.type === type)?.label ?? "Unit"}`));
    }
    if (file && candidates.length === 0) {
      view.error.textContent = "This file format is not supported. Choose an Excel, CSV, Word, PowerPoint or PDF file.";
      view.error.hidden = false;
    }
    setBusy(false);
  });

  view.close.addEventListener("click", close);
  view.cancel.addEventListener("click", close);
  view.dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  view.dialog.addEventListener("click", event => { if (event.target === view.dialog) close(); });
  view.form.addEventListener("submit", event => {
    event.preventDefault();
    if (busy || disposed || !file || candidates.length === 0) return;
    const type = Number(select.value) as UniverType;
    if (!candidates.includes(type)) return;
    const version = ++generation;
    controller = new AbortController();
    view.error.hidden = true;
    setBusy(true);
    showProgress({ stage: "uploading" });
    void options.onImport(file, type, {
      signal: controller.signal,
      onProgress: value => { if (!disposed && version === generation) showProgress(value); },
    }).then(() => {
      if (!disposed && version === generation) view.dialog.close();
    }).catch((error: unknown) => {
      if (disposed || version !== generation) return;
      view.error.textContent = errorMessage(error, "Unable to import the file. Please try again.");
      view.error.hidden = false;
    }).finally(() => {
      if (disposed || version !== generation) return;
      controller = undefined;
      setBusy(false);
    });
  });

  return {
    open() {
      if (disposed || view.dialog.open) return;
      file = undefined;
      candidates = [];
      input.value = "";
      select.replaceChildren();
      target.hidden = true;
      typeLabel.hidden = true;
      detail.hidden = true;
      view.error.hidden = true;
      setBusy(false);
      view.dialog.showModal();
      input.focus();
    },
    dispose() {
      disposed = true;
      generation++;
      controller?.abort();
      view.dialog.close();
      view.dialog.remove();
    },
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
