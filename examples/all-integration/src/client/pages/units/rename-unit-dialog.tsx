import { useState } from "react";
import type { AppUnit, Locale } from "../../../shared/api-types";
import { api } from "../../api-client";
import { messages } from "../../locales";

export function RenameUnitDialog({
  unit,
  locale,
  onClose,
  onRenamed,
}: {
  unit: AppUnit;
  locale: Locale;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const t = messages[locale];
  const [name, setName] = useState(unit.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName === unit.name) return;
    setPending(true);
    setError("");
    try {
      await api(`/api/units/${encodeURIComponent(unit.unitId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      });
      onRenamed();
    } catch {
      setError(t.genericError);
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
        aria-labelledby="rename-title"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label={t.cancel}
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">{unit.name}</p>
        <h2 id="rename-title">{t.rename}</h2>
        <form onSubmit={submit}>
          <label>
            <span>{t.renamePrompt}</span>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
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
            <button
              className="primary-button"
              disabled={pending || !name.trim() || name.trim() === unit.name}
              type="submit"
            >
              {pending ? t.working : t.rename}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
