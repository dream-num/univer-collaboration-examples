import type Database from "libsql";
import type { Locale } from "../../shared/api-types";

export interface AuthUserRow {
  user_id: string;
  username: string;
  display_name: string;
  password_hash: string;
  locale: Locale;
  created_at_ms: number;
  updated_at_ms: number;
}

export function createAuthRepository(database: Database.Database) {
  const findUserByName = database.prepare(
    `SELECT user_id, username, display_name, password_hash, locale,
      created_at_ms, updated_at_ms
    FROM app_users WHERE username = ? COLLATE NOCASE`,
  );
  const findUserBySession = database.prepare(
    `SELECT u.user_id, u.username, u.display_name, u.password_hash, u.locale,
      u.created_at_ms, u.updated_at_ms
    FROM app_sessions s
    JOIN app_users u ON u.user_id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at_ms > ?`,
  );
  const insertUser = database.prepare(
    `INSERT INTO app_users (
      user_id, username, display_name, password_hash, locale,
      created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSession = database.prepare(
    `INSERT INTO app_sessions (token_hash, user_id, created_at_ms, expires_at_ms)
    VALUES (?, ?, ?, ?)`,
  );
  const deleteSession = database.prepare(
    "DELETE FROM app_sessions WHERE token_hash = ?",
  );
  const updateLocale = database.prepare(
    "UPDATE app_users SET locale = ?, updated_at_ms = ? WHERE user_id = ?",
  );

  return {
    findUserByName(username: string) {
      return findUserByName.get(username) as AuthUserRow | undefined;
    },
    findUserBySession(tokenHash: string, now: number) {
      return findUserBySession.get(tokenHash, now) as AuthUserRow | undefined;
    },
    insertUser(input: {
      userId: string;
      username: string;
      displayName: string;
      passwordHash: string;
      locale: Locale;
      now: number;
    }) {
      insertUser.run(
        input.userId,
        input.username,
        input.displayName,
        input.passwordHash,
        input.locale,
        input.now,
        input.now,
      );
    },
    insertSession(input: {
      tokenHash: string;
      userId: string;
      now: number;
      expiresAt: number;
    }) {
      insertSession.run(
        input.tokenHash,
        input.userId,
        input.now,
        input.expiresAt,
      );
    },
    deleteSession(tokenHash: string) {
      deleteSession.run(tokenHash);
    },
    updateLocale(userId: string, locale: Locale) {
      updateLocale.run(locale, Date.now(), userId);
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
