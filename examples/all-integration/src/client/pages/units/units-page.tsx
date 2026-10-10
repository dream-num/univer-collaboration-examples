import { useEffect, useState } from "react";
import type { AppUnit, Locale, User } from "../../../shared/api-types";
import { api } from "../../api-client";
import { LanguageSwitch } from "../../components/language-switch";
import { messages } from "../../locales";
import { CreateUnitDialog } from "./create-unit-dialog";
import { ImportFileDialog } from "./import-file-dialog";
import { RenameUnitDialog } from "./rename-unit-dialog";
import { UnitCard } from "./unit-card";

type UnitScope = "recent" | "created" | "shared" | "trash";

export function UnitsPage({
  user,
  locale,
  onLocaleChange,
  onLogout,
}: {
  user: User;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  onLogout: () => void;
}) {
  const t = messages[locale];
  const [units, setUnits] = useState<AppUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [renaming, setRenaming] = useState<AppUnit>();
  const [scope, setScope] = useState<UnitScope>("recent");

  function refresh(nextScope = scope) {
    setLoading(true);
    const query = nextScope === "recent" ? "" : `?scope=${nextScope}`;
    return api<{ units: AppUnit[] }>(`/api/units${query}`)
      .then((result) => setUnits(result.units))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void refresh(scope);
  }, [scope]);

  function openUnit(unit: AppUnit) {
    location.href = `/editor?unit=${encodeURIComponent(unit.unitId)}&type=${unit.type}`;
  }

  async function deleteUnit(unit: AppUnit) {
    if (!window.confirm(t.deleteConfirm)) return;
    await api<void>(`/api/units/${encodeURIComponent(unit.unitId)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  async function recoverUnit(unit: AppUnit) {
    await api(`/api/units/${encodeURIComponent(unit.unitId)}/recover`, {
      method: "POST",
    });
    await refresh();
  }

  const navItems: Array<{ scope: UnitScope; icon: string; label: string }> = [
    { scope: "recent", icon: "◷", label: t.recent },
    { scope: "created", icon: "▤", label: t.createdByMe },
    { scope: "shared", icon: "♧", label: t.shared },
    { scope: "trash", icon: "♲", label: t.trash },
  ];

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="mini-mark">U</span>
          <strong>{t.brand}</strong>
        </div>
        <div className="create-actions">
          <button
            className="new-button"
            type="button"
            onClick={() => setCreating(true)}
          >
            <span>＋</span>
            {t.create}
          </button>
          <button
            className="import-button"
            type="button"
            onClick={() => setImporting(true)}
          >
            ⇧ {t.import}
          </button>
        </div>
        <nav aria-label={t.units}>
          {navItems.map((item) => (
            <button
              key={item.scope}
              className={scope === item.scope ? "active" : ""}
              type="button"
              onClick={() => setScope(item.scope)}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{user.displayName}</strong>
            <small>@{user.username}</small>
          </div>
        </div>
      </aside>

      <section className="workspace-content">
        <header>
          <div>
            <p className="eyebrow">
              {t.greeting}, {user.displayName}
            </p>
            <h1>
              {scope === "trash"
                ? t.trash
                : scope === "shared"
                  ? t.shared
                  : scope === "created"
                    ? t.createdByMe
                    : t.units}
            </h1>
          </div>
          <div className="header-actions">
            <LanguageSwitch locale={locale} onChange={onLocaleChange} />
            <button className="text-button" type="button" onClick={onLogout}>
              {t.logout}
            </button>
          </div>
        </header>

        {loading ? (
          <div className="list-loading">{t.loading}</div>
        ) : units.length === 0 ? (
          <div className="empty-state">
            <div className="empty-illustration" aria-hidden="true">
              <span className="paper paper-one" />
              <span className="paper paper-two" />
              <span className="spark">✦</span>
            </div>
            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyBody}</p>
          </div>
        ) : (
          <div className="unit-grid">
            {units.map((unit) => (
              <UnitCard
                key={unit.unitId}
                unit={unit}
                locale={locale}
                inTrash={scope === "trash"}
                onOpen={() => openUnit(unit)}
                onRename={() => setRenaming(unit)}
                onDelete={() => void deleteUnit(unit)}
                onRecover={() => void recoverUnit(unit)}
              />
            ))}
          </div>
        )}
      </section>

      {creating && (
        <CreateUnitDialog
          locale={locale}
          onClose={() => setCreating(false)}
          onCreated={openUnit}
        />
      )}
      {importing && (
        <ImportFileDialog
          locale={locale}
          onClose={() => setImporting(false)}
          onCreated={openUnit}
        />
      )}
      {renaming && (
        <RenameUnitDialog
          unit={renaming}
          locale={locale}
          onClose={() => setRenaming(undefined)}
          onRenamed={() => {
            setRenaming(undefined);
            void refresh();
          }}
        />
      )}
    </main>
  );
}
