import type { IMember } from "@univerjs/protocol";
import type { AppUnit, Locale } from "../../../shared/api-types";
import { LanguageSwitch } from "../../components/language-switch";
import { messages } from "../../locales";
import { OnlineMembers } from "./online-members";

export function EditorHeader({
  unit,
  locale,
  onLocaleChange,
  onMembers,
  onlineMembers,
  userId,
}: {
  unit: AppUnit | undefined;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onMembers: () => void;
  onlineMembers: readonly IMember[];
  userId: string;
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
      <OnlineMembers members={onlineMembers} userId={userId} locale={locale} />
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
