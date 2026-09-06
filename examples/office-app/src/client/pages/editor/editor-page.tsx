import { useEffect, useMemo, useState } from "react";
import type { AppUnit, Locale, User } from "../../../shared/api-types";
import { api } from "../../api-client";
import { messages } from "../../locales";
import type { EditorPresence, MountedUniverEditor } from "../../univer/types";
import { EditorHeader } from "./editor-header";
import { MembersDialog } from "./members-dialog";

export function EditorPage({
  user,
  locale,
  onLocaleChange,
}: {
  user: User;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
}) {
  const t = messages[locale];
  const [unit, setUnit] = useState<AppUnit>();
  const [error, setError] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [editor, setEditor] = useState<MountedUniverEditor>();
  const [presence, setPresence] = useState<EditorPresence>({ status: "connecting", members: [] });
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const unitId = params.get("unit") ?? "";

  useEffect(() => {
    api<{ unit: AppUnit }>(`/api/units/${encodeURIComponent(unitId)}`)
      .then((result) => setUnit(result.unit))
      .catch(() => setError(true));
  }, [unitId]);

  useEffect(() => {
    if (!unit) return;
    let disposer: { dispose(): void } | undefined;
    let cancelled = false;
    setPresence({ status: "connecting", members: [] });

    import("../../univer/mount-editor")
      .then(({ mountUniverEditor }) =>
        mountUniverEditor({
          container: "univer-editor",
          user,
          locale,
          unitType: unit.type,
          unitId: unit.unitId,
          onPresenceChange: (next) => {
            if (!cancelled) setPresence(next);
          },
        }),
      )
      .then((mounted) => {
        if (cancelled) {
          mounted.dispose();
        } else {
          disposer = mounted;
          setEditor(mounted);
        }
      })
      .catch((mountError) => {
        console.error(mountError);
        setError(true);
      });

    return () => {
      cancelled = true;
      setEditor(undefined);
      disposer?.dispose();
    };
  }, [unit, user.displayName, user.userId]);

  useEffect(() => {
    editor?.setLocale(locale);
  }, [editor, locale]);

  if (error) {
    return (
      <main className="editor-error">
        <p>{t.genericError}</p>
        <a href="/">{t.back}</a>
      </main>
    );
  }

  return (
    <main className="editor-shell">
      <EditorHeader
        unit={unit}
        locale={locale}
        onLocaleChange={onLocaleChange}
        onMembers={() => setMembersOpen(true)}
        presence={presence}
        userId={user.userId}
        onReconnect={() => editor?.reconnect()}
      />
      <div id="univer-editor" aria-label={unit?.name ?? t.opening} />
      {unit && membersOpen && (
        <MembersDialog
          unit={unit}
          locale={locale}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </main>
  );
}
