import { useEffect, useState } from "react";
import type {
  AppUnit,
  Locale,
  UnitMember,
} from "../../../shared/api-types";
import { api } from "../../api-client";
import { messages } from "../../locales";

export function MembersDialog({
  unit,
  locale,
  onClose,
}: {
  unit: AppUnit;
  locale: Locale;
  onClose: () => void;
}) {
  const t = messages[locale];
  const [members, setMembers] = useState<UnitMember[]>([]);
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState("");

  function refresh() {
    return api<{ members: UnitMember[] }>(
      `/api/units/${encodeURIComponent(unit.unitId)}/members`,
    ).then((result) => setMembers(result.members));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function addMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const username = String(form.get("username") ?? "").trim();

    try {
      await api(
        `/api/units/${encodeURIComponent(unit.unitId)}/members/${encodeURIComponent(username)}`,
        { method: "PUT", body: JSON.stringify({ role }) },
      );
      formElement.reset();
      await refresh();
    } catch {
      setError(t.userNotFound);
    }
  }

  async function removeMember(member: UnitMember) {
    await api(
      `/api/units/${encodeURIComponent(unit.unitId)}/members/${encodeURIComponent(member.username)}`,
      { method: "DELETE" },
    );
    await refresh();
  }

  async function updateMemberRole(
    member: UnitMember,
    nextRole: "editor" | "viewer",
  ) {
    setError("");
    try {
      await api(
        `/api/units/${encodeURIComponent(unit.unitId)}/members/${encodeURIComponent(member.username)}`,
        { method: "PUT", body: JSON.stringify({ role: nextRole }) },
      );
      await refresh();
    } catch {
      setError(t.genericError);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="create-dialog members-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="members-title"
      >
        <button
          className="dialog-close"
          type="button"
          aria-label={t.cancel}
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">{unit.name}</p>
        <h2 id="members-title">{t.manageMembers}</h2>
        <form className="member-form" onSubmit={addMember}>
          <label>
            <span>{t.addMember}</span>
            <input name="username" placeholder={t.memberUsername} required />
          </label>
          <label>
            <span>{t.role}</span>
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "editor" | "viewer")
              }
            >
              <option value="editor">{t.editor}</option>
              <option value="viewer">{t.viewer}</option>
            </select>
          </label>
          <button className="primary-button" type="submit">
            {t.addMember}
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="member-list">
          {members.map((member) => (
            <div className="member-row" key={member.userId}>
              <span className="avatar">
                {member.displayName.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{member.displayName}</strong>
                <small>@{member.username}</small>
              </span>
              {member.role === "creator" ? (
                <em>{t.creator}</em>
              ) : (
                <>
                  <select
                    aria-label={`${t.role}: ${member.displayName}`}
                    value={member.role}
                    onChange={(event) =>
                      void updateMemberRole(
                        member,
                        event.target.value as "editor" | "viewer",
                      )
                    }
                  >
                    <option value="editor">{t.editor}</option>
                    <option value="viewer">{t.viewer}</option>
                  </select>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => void removeMember(member)}
                  >
                    {t.remove}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
