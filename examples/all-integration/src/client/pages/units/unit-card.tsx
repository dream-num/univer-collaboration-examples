import type { AppUnit, Locale } from "../../../shared/api-types";
import { unitKinds } from "../../../shared/unit-types";
import { messages } from "../../locales";

export function UnitCard({
  unit,
  locale,
  inTrash,
  onOpen,
  onRename,
  onDelete,
  onRecover,
}: {
  unit: AppUnit;
  locale: Locale;
  inTrash: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onRecover: () => void;
}) {
  const t = messages[locale];
  const kind = unitKinds.find((item) => item.type === unit.type);
  if (!kind) return null;

  return (
    <article className="unit-card">
      <button
        className="unit-card-open"
        type="button"
        disabled={inTrash}
        onClick={onOpen}
      >
        <span className={`unit-preview ${kind.color}`}>
          <span className="unit-icon">{kind.glyph}</span>
        </span>
        <span className="unit-card-body">
          <strong>{unit.name}</strong>
          <span>
            {t.creator}: {unit.creatorDisplayName}
          </span>
          <span>
            <em>{t[unit.role]}</em> · {t.updated}{" "}
            {new Intl.DateTimeFormat(locale, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(unit.updatedAt)}
          </span>
        </span>
      </button>
      <div className="unit-card-actions">
        {!inTrash && unit.role !== "viewer" && (
          <button className="text-button" type="button" onClick={onRename}>
            {t.rename}
          </button>
        )}
        {unit.role === "creator" && (
          <button
            className="text-button"
            type="button"
            onClick={inTrash ? onRecover : onDelete}
          >
            {inTrash ? t.recover : t.delete}
          </button>
        )}
      </div>
    </article>
  );
}
