import { useEffect, useMemo, useState } from "react";
import type { AppUnit, Locale, User } from "../../../shared/api-types";
import { api } from "../../api-client";
import { messages } from "../../locales";
import { EditorHeader } from "./editor-header";
import { MembersDialog } from "./members-dialog";
import { useCollaborationMembers } from "./use-collaboration-members";
import { useUniverEditor } from "./use-univer-editor";

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
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const unitId = params.get("unit") ?? "";
  const { editor, error: editorError } = useUniverEditor({
    unit,
    user,
    locale,
    container: "univer-editor",
  });
  const onlineMembers = useCollaborationMembers(editor?.univerAPI, unit?.unitId);

  useEffect(() => {
    api<{ unit: AppUnit }>(`/api/units/${encodeURIComponent(unitId)}`)
      .then((result) => setUnit(result.unit))
      .catch(() => setError(true));
  }, [unitId]);

  if (error || editorError) {
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
        onlineMembers={onlineMembers}
        userId={user.userId}
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
