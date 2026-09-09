import { useState } from "react";
import type { AppUnit, Locale } from "../../../shared/api-types";
import { importFormats, unitKinds } from "../../../shared/unit-types";
import { messages } from "../../locales";

export function ImportFileDialog({
  locale,
  onClose,
  onCreated,
}: {
  locale: Locale;
  onClose: () => void;
  onCreated: (unit: AppUnit) => void;
}) {
  const t = messages[locale];
  const [type, setType] = useState(2);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const importKinds = unitKinds.filter((kind) => kind.type !== 6);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    form.set("type", String(type));

    try {
      const response = await fetch("/api/import", { method: "POST", body: form });
      if (!response.ok) throw new Error("IMPORT_FAILED");
      const result = (await response.json()) as { unit: AppUnit };
      onCreated(result.unit);
    } catch {
      setError(t.unsupportedFormat);
      setPending(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label={t.cancel}
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">{t.importIntro}</p>
        <h2 id="import-title">{t.importTitle}</h2>
        <div className="unit-picker import-picker" role="radiogroup">
          {importKinds.map((kind) => (
            <button
              key={kind.type}
              type="button"
              role="radio"
              aria-checked={type === kind.type}
              className={type === kind.type ? "selected" : ""}
              onClick={() => setType(kind.type)}
            >
              <span className={`unit-icon ${kind.color}`}>{kind.glyph}</span>
              <span>{t[kind.key]}</span>
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          <label>
            <span>{t.chooseFile}</span>
            <input
              key={type}
              name="file"
              type="file"
              accept={importFormats[type]}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button className="text-button" type="button" onClick={onClose}>
              {t.cancel}
            </button>
            <button className="primary-button" disabled={pending} type="submit">
              {pending ? t.working : t.import}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
