import { useEffect, useMemo, useState } from "react";
import type { Locale, User } from "../shared/api-types";
import { api } from "./api-client";
import { messages } from "./locales";
import { AuthPage } from "./pages/auth/auth-page";
import { EditorPage } from "./pages/editor/editor-page";
import { UnitsPage } from "./pages/units/units-page";

export function App() {
  const initialLocale = useMemo<Locale>(
    () =>
      navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US",
    [],
  );
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [user, setUser] = useState<User>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>("/api/auth/me")
      .then((result) => {
        setUser(result.user);
        setLocale(result.user.locale);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].brand;
  }, [locale]);

  async function changeLocale(nextLocale: Locale) {
    if (user) {
      const result = await api<{ user: User }>("/api/auth/locale", {
        method: "PATCH",
        body: JSON.stringify({ locale: nextLocale }),
      });
      setUser(result.user);
    }
    setLocale(nextLocale);
  }

  async function logout() {
    await api<void>("/api/auth/logout", { method: "POST" });
    setUser(undefined);
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <span className="mini-mark">U</span>
        <p>{messages[locale].loading}</p>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthPage
        locale={locale}
        onLocaleChange={setLocale}
        onAuthenticated={(nextUser) => {
          setUser(nextUser);
          setLocale(nextUser.locale);
        }}
      />
    );
  }

  if (location.pathname === "/editor") {
    return (
      <EditorPage
        user={user}
        locale={locale}
        onLocaleChange={(nextLocale) => void changeLocale(nextLocale)}
      />
    );
  }

  return (
    <UnitsPage
      user={user}
      locale={locale}
      onLocaleChange={(nextLocale) => void changeLocale(nextLocale)}
      onLogout={logout}
    />
  );
}
