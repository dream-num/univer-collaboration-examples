import { useMemo } from "react";
import type { IMember } from "@univerjs/protocol";
import type { Locale } from "../../../shared/api-types";
import { messages } from "../../locales";
import type { EditorPresence } from "../../univer/types";

export function OnlineMembers({
  presence,
  userId,
  locale,
  onReconnect,
}: {
  presence: EditorPresence;
  userId: string;
  locale: Locale;
  onReconnect: () => void;
}) {
  const t = messages[locale];
  const users = useMemo(() => {
    const grouped = new Map<string, { member: IMember; connections: number }>();
    for (const member of presence.members) {
      const existing = grouped.get(member.userID);
      if (existing) existing.connections++;
      else grouped.set(member.userID, { member, connections: 1 });
    }
    return [...grouped.values()];
  }, [presence.members]);

  if (presence.status !== "online") {
    return (
      <div className="presence-status" role="status">
        <span>{presence.status === "offline" ? t.presenceOffline : t.presenceConnecting}</span>
        {presence.status === "offline" && (
          <button className="text-button" type="button" onClick={onReconnect}>
            {t.reconnect}
          </button>
        )}
      </div>
    );
  }

  return (
    <details className="online-members">
      <summary aria-label={`${t.onlineMembers}: ${users.length}`}>
        <span className="online-member-avatars" aria-hidden="true">
          {users.slice(0, 4).map(({ member }) => (
            <MemberAvatar key={member.userID} member={member} />
          ))}
        </span>
        <span>{users.length} {t.onlineMembers}</span>
      </summary>
      <ul className="online-member-list" aria-label={t.onlineMembers}>
        {users.map(({ member, connections }) => (
          <li key={member.userID}>
            <MemberAvatar member={member} />
            <span>
              <strong>{member.name || member.userID}{member.userID === userId ? ` (${t.you})` : ""}</strong>
              {connections > 1 && <small>{connections} {t.presenceConnections}</small>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function MemberAvatar({ member }: { member: IMember }) {
  return (
    <span className="online-member-avatar" title={member.name || member.userID}>
      {member.avatar
        ? <img src={member.avatar} alt="" />
        : Array.from(member.name || member.userID)[0]?.toUpperCase()}
    </span>
  );
}
