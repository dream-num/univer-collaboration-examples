import type { Locale } from "../../shared/api-types";
import { messages } from "../locales";

export function LanguageSwitch({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <div className="language-switch" aria-label={messages[locale].language}>
      <button
        className={locale === "zh-CN" ? "active" : ""}
        onClick={() => onChange("zh-CN")}
        type="button"
      >
        中
      </button>
      <span aria-hidden="true">/</span>
      <button
        className={locale === "en-US" ? "active" : ""}
        onClick={() => onChange("en-US")}
        type="button"
      >
        EN
      </button>
    </div>
  );
}
