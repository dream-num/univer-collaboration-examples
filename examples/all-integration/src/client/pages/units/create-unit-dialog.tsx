import { useState } from "react";
import type { AppUnit, Locale } from "../../../shared/api-types";
import { unitKinds } from "../../../shared/unit-types";
import { api } from "../../api-client";
import { messages } from "../../locales";

export function CreateUnitDialog({
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
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await api<{ unit: AppUnit }>("/api/units", {
        method: "POST",
        body: JSON.stringify({ type, name }),
      });
      onCreated(result.unit);
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
        aria-labelledby="create-title"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label={t.cancel}
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">{t.createIntro}</p>
        <h2 id="create-title">{t.createTitle}</h2>
        <div className="unit-picker" role="radiogroup">
          {unitKinds.map((kind) => (
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
            <span>{t.unitName}</span>
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
              disabled={pending || !name.trim()}
              type="submit"
            >
              {pending ? t.working : t.createNow}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
