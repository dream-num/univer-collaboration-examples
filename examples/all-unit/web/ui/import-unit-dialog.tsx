import type { UniverType } from "@univerjs/protocol";
import { useEffect, useRef, useState } from "react";
import { UNIT_TYPES, unitLink } from "../../shared/units";
import { getImportTypes, IMPORT_ACCEPT, importUnit } from "../api/import";
import { Dialog, errorMessage } from "./dialog";
import { Icon, UnitIcon } from "./icons";

export function ImportUnitDialog({ onClose }: { onClose(): void }) {
  const [file, setFile] = useState<File>();
  const [type, setType] = useState<UniverType>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController>(null);
  const candidates = file ? getImportTypes(file.name) : [];

  useEffect(() => {
    input.current?.focus();
    return () => controller.current?.abort();
  }, []);

  function close() {
    controller.current?.abort();
    onClose();
  }

  function selectFile(file: File | undefined) {
    setFile(file);
    const types = file ? getImportTypes(file.name) : [];
    setType(types[0]);
    setError(file && !types.length
      ? "This file format is not supported. Choose an Excel, CSV, Word, PowerPoint or PDF file."
      : "");
  }

  async function submit() {
    if (busy || !file || type === undefined || !candidates.includes(type)) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const unitId = await importUnit(file, type, { signal: request.signal });
      if (!request.signal.aborted) {
        location.assign(unitLink(unitId, type));
        onClose();
      }
    } catch (error) {
      if (!request.signal.aborted) setError(errorMessage(error, "Unable to import the file. Please try again."));
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return (
    <Dialog
      title="Import a file" description="Turn your file into a collaborative Unit."
      onClose={close} closeLabel={busy ? "Stop waiting and close dialog" : "Close dialog"}
    >
      <form className="au-dialog-form" aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="au-dialog-content">
          <label className="au-field-label" htmlFor="import-unit-file">File</label>
          <div className="au-file-picker">
            <span className="au-upload-icon"><Icon name="upload" /></span>
            <input
              ref={input} id="import-unit-file" className="au-file-input" type="file"
              accept={IMPORT_ACCEPT} disabled={busy}
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <p className="au-file-formats">Excel, CSV, Word, PowerPoint or PDF</p>
          </div>
          {file && <p className="au-file-detail">{file.name} · {formatSize(file.size)}</p>}
          {candidates.length > 1 && (
            <div className="au-import-target">
              <label className="au-field-label" htmlFor="import-unit-type">Import as</label>
              <select
                id="import-unit-type" className="au-select" value={type} disabled={busy}
                onChange={(event) => setType(Number(event.target.value) as UniverType)}
              >
                {candidates.map((type) => (
                  <option key={type} value={type}>{UNIT_TYPES.find((item) => item.type === type)?.label}</option>
                ))}
              </select>
              <p className="au-field-hint">Choose a spreadsheet or a structured database.</p>
            </div>
          )}
          {candidates.length === 1 && (
            <p className="au-import-type-label">
              <UnitIcon type={candidates[0]} />Import as {UNIT_TYPES.find((item) => item.type === candidates[0])?.label}
            </p>
          )}
          {busy && (
            <p className="au-field-hint">
              You can stop waiting. An import already started on the server may still finish and appear in your units.
            </p>
          )}
        </div>
        {error && <p className="au-dialog-error" role="alert">{error}</p>}
        <footer className="au-dialog-footer">
          <button className="au-button au-button-ghost" type="button" onClick={close}>{busy ? "Stop waiting" : "Cancel"}</button>
          <button className="au-button au-button-primary" type="submit" disabled={busy || !file || !candidates.length}>
            {busy ? "Importing…" : "Import file"}
          </button>
        </footer>
      </form>
    </Dialog>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
