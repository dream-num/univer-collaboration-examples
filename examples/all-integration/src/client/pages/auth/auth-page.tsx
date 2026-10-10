import { useState } from "react";
import type { Locale, User } from "../../../shared/api-types";
import { api } from "../../api-client";
import { LanguageSwitch } from "../../components/language-switch";
import { messages } from "../../locales";

type AuthMode = "login" | "register";

export function AuthPage({
  locale,
  onLocaleChange,
  onAuthenticated,
}: {
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("register");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const t = messages[locale];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");

    if (
      mode === "register" &&
      password !== String(form.get("confirmPassword") ?? "")
    ) {
      setError(t.passwordsDoNotMatch);
      setPending(false);
      return;
    }

    try {
      const result = await api<{ user: User }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          displayName: form.get("displayName"),
          password,
          locale,
        }),
      });
      onAuthenticated(result.user);
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : "";
      const key = (
        {
          INVALID_CREDENTIALS: "invalidCredentials",
          USERNAME_TAKEN: "usernameTaken",
          INVALID_USERNAME: "invalidUsername",
          INVALID_DISPLAY_NAME: "invalidDisplayName",
          INVALID_PASSWORD: "invalidPassword",
        } as const
      )[code];
      setError(key ? t[key] : t.genericError);
    } finally {
      setPending(false);
    }
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
  }

  return (
    <main className="auth-shell">
      <section className="auth-story" aria-labelledby="welcome-title">
        <div className="brand-mark" aria-hidden="true">
          <span>U</span>
        </div>
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h1 id="welcome-title">{t.headline}</h1>
          <p className="intro">{t.intro}</p>
        </div>
        <div className="unit-orbit" aria-hidden="true">
          <span>DOC</span>
          <span>SHEET</span>
          <span>SLIDE</span>
          <span>BOARD</span>
          <span>BASE</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-top">
          <span className="wordmark">{t.brand}</span>
          <LanguageSwitch locale={locale} onChange={onLocaleChange} />
        </div>
        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              onClick={() => selectMode("login")}
            >
              {t.login}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              onClick={() => selectMode("register")}
            >
              {t.register}
            </button>
          </div>

          <form onSubmit={submit}>
            <label>
              <span>{t.username}</span>
              <input
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={32}
              />
              <small>{t.usernameHint}</small>
            </label>
            {mode === "register" && (
              <label>
                <span>{t.displayName}</span>
                <input
                  name="displayName"
                  autoComplete="name"
                  required
                  maxLength={64}
                />
              </label>
            )}
            <label>
              <span>{t.password}</span>
              <input
                name="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                maxLength={128}
              />
              <small>{t.passwordHint}</small>
            </label>
            {mode === "register" && (
              <label>
                <span>{t.confirmPassword}</span>
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={pending} type="submit">
              {pending
                ? t.working
                : mode === "login"
                  ? t.submitLogin
                  : t.submitRegister}
            </button>
          </form>
        </div>
        <p className="auth-footnote">Univer Collaboration · SQLite</p>
      </section>
    </main>
  );
}
