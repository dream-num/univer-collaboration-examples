import { randomBytes, randomUUID } from "node:crypto";
import type { Locale, User } from "../../shared/api-types";
import type { AuthRepository, AuthUserRow } from "./auth.repository";
import { hashPassword, hashSessionToken, verifyPassword } from "./password";

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1_000;

export class AuthError extends Error {
  constructor(
    readonly code:
      | "INVALID_CREDENTIALS"
      | "INVALID_DISPLAY_NAME"
      | "INVALID_LOCALE"
      | "INVALID_PASSWORD"
      | "INVALID_USERNAME"
      | "USERNAME_TAKEN",
    readonly status: number,
  ) {
    super(code);
  }
}

function toUser(row: AuthUserRow): User {
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    locale: row.locale,
  };
}

export function createAuthService(repository: AuthRepository) {
  function issueSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    const now = Date.now();
    repository.insertSession({
      tokenHash: hashSessionToken(token),
      userId,
      now,
      expiresAt: now + SESSION_DURATION_MS,
    });
    return token;
  }

  return {
    register(input: {
      username: string;
      displayName: string;
      password: string;
      locale: Locale;
    }) {
      const username = input.username.trim();
      const displayName = input.displayName.trim();
      if (!/^[a-zA-Z0-9._-]{3,32}$/u.test(username))
        throw new AuthError("INVALID_USERNAME", 400);
      if (displayName.length < 1 || displayName.length > 64)
        throw new AuthError("INVALID_DISPLAY_NAME", 400);
      if (input.password.length < 8 || input.password.length > 128)
        throw new AuthError("INVALID_PASSWORD", 400);
      if (repository.findUserByName(username))
        throw new AuthError("USERNAME_TAKEN", 409);

      const userId = randomUUID();
      const now = Date.now();
      try {
        repository.insertUser({
          userId,
          username,
          displayName,
          passwordHash: hashPassword(input.password),
          locale: input.locale,
          now,
        });
      } catch (error) {
        if (String(error).includes("UNIQUE"))
          throw new AuthError("USERNAME_TAKEN", 409);
        throw error;
      }
      return {
        user: { userId, username, displayName, locale: input.locale },
        token: issueSession(userId),
      };
    },
    login(username: string, password: string) {
      const row = repository.findUserByName(username.trim());
      if (!row || !verifyPassword(password, row.password_hash))
        throw new AuthError("INVALID_CREDENTIALS", 401);
      return { user: toUser(row), token: issueSession(row.user_id) };
    },
    logout(token: string | undefined) {
      if (token) repository.deleteSession(hashSessionToken(token));
    },
    currentUser(token: string | undefined) {
      if (!token) return undefined;
      const row = repository.findUserBySession(
        hashSessionToken(token),
        Date.now(),
      );
      return row ? toUser(row) : undefined;
    },
    setLocale(user: User, locale: Locale) {
      repository.updateLocale(user.userId, locale);
      return { ...user, locale };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
