import type { AppUnit, Locale } from "../../../shared/api-types";
import { LanguageSwitch } from "../../components/language-switch";
import { messages } from "../../locales";

export function EditorHeader({
  unit,
  locale,
  onLocaleChange,
  onMembers,
}: {
  unit: AppUnit | undefined;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onMembers: () => void;
}) {
  const t = messages[locale];

  return (
    <header className="editor-header">
      <a href="/" aria-label={t.back}>←</a>
      <span className="mini-mark">U</span>
      <div className="editor-unit-info">
        <strong>{unit?.name ?? t.opening}</strong>
        {unit && <small>{t[unit.role]}</small>}
      </div>
      <LanguageSwitch locale={locale} onChange={onLocaleChange} />
      {unit?.role === "creator" && (
        <button
          className="text-button editor-members"
          type="button"
          onClick={onMembers}
        >
          {t.members}
        </button>
      )}
    </header>
  );
}
