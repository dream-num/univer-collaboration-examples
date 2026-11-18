import { useEffect, useRef, useState } from "react";
import { unitLink } from "../../shared/units";
import { IMPORT_ACCEPT, importUnit } from "../api/import";
import { Icon } from "./icons";

export function ImportUnitButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController>(null);

  useEffect(() => () => controller.current?.abort(), []);

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }

  async function importFile(file: File | undefined) {
    if (!file || controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    try {
      const { unitId, type } = await importUnit(file, { signal: request.signal });
      if (!request.signal.aborted) location.assign(unitLink(unitId, type));
    } catch (error) {
      if (!request.signal.aborted) {
        setError(error instanceof Error && error.message ? error.message : "Unable to import the file. Please try again.");
      }
    } finally {
      if (!request.signal.aborted) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className="au-import">
      <input
        ref={input} type="file" accept={IMPORT_ACCEPT} hidden disabled={busy}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void importFile(file);
        }}
      />
      <button className="au-button au-button-secondary" type="button" disabled={busy}
        onClick={() => input.current?.click()}>
        <Icon name="upload" />{busy ? "Importing…" : "Import"}
      </button>
      {busy && <>
        <button className="au-button au-button-ghost" type="button" onClick={cancel}>Stop waiting</button>
        <p className="au-import-message" role="status">The server may finish the import after you stop waiting.</p>
      </>}
      {error && <p className="au-import-message" role="alert">{error}</p>}
    </div>
  );
}
