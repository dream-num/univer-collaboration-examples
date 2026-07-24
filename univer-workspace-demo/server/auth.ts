import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { IncomingMessage } from "node:http";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { CollabError } from "@univerjs/collaboration-service";
import type { Response } from "express";
import type { DemoUser } from "./demo-user.js";
import { PRESET_USERS } from "../shared/preset-users.js";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "univer_workspace_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface UserRow {
  readonly user_id: string;
  readonly username: string;
  readonly password_hash: string;
  readonly name: string;
  readonly created_at: number;
}

export class UserStore {
  private readonly _database: DatabaseSync;
  private _disposed = false;

  constructor(filename: string) {
    this._database = new DatabaseSync(filename);
    this._database.exec(`
      CREATE TABLE IF NOT EXISTS workspace_users (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async create(username: string, password: string): Promise<DemoUser> {
    this._assertOpen();
    const normalizedUsername = normalizeUsername(username);
    validatePassword(password);
    if (this.getByUsername(normalizedUsername)) {
      throw new CollabError("INVALID_REQUEST", "用户名已存在");
    }

    const user: DemoUser = {
      userId: randomUUID(),
      username: normalizedUsername,
      name: normalizedUsername,
      createdAt: Date.now(),
    };
    const passwordHash = await hashPassword(password);
    try {
      this._database
        .prepare(
          `INSERT INTO workspace_users
            (user_id, username, password_hash, name, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          user.userId,
          user.username,
          passwordHash,
          user.name,
          user.createdAt
        );
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        throw new CollabError("INVALID_REQUEST", "用户名已存在");
      }
      throw error;
    }
    return user;
  }

  /**
   * 示例账号每次启动都恢复约定密码；保留既有 userId，避免破坏它名下的资源归属。
   */
  async ensurePresetUsers(): Promise<void> {
    for (const preset of PRESET_USERS) {
      const passwordHash = await hashPassword(preset.password);
      const existing = this._getRowByUsername(preset.username);
      if (existing) {
        this._database
          .prepare(
            `UPDATE workspace_users
             SET password_hash = ?, name = ?
             WHERE user_id = ?`
          )
          .run(passwordHash, preset.name, existing.user_id);
        continue;
      }
      this._database
        .prepare(
          `INSERT INTO workspace_users
            (user_id, username, password_hash, name, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(
          preset.userId,
          preset.username,
          passwordHash,
          preset.name,
          Date.now()
        );
    }
  }

  async authenticate(
    username: string,
    password: string
  ): Promise<DemoUser | null> {
    this._assertOpen();
    const row = this._getRowByUsername(normalizeUsername(username));
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return null;
    }
    return toUser(row);
  }

  getById(userId: string): DemoUser | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT user_id, username, password_hash, name, created_at
         FROM workspace_users WHERE user_id = ?`
      )
      .get(userId) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  getByUsername(username: string): DemoUser | null {
    const row = this._getRowByUsername(normalizeUsername(username));
    return row ? toUser(row) : null;
  }

  search(query: string, limit = 10): DemoUser[] {
    this._assertOpen();
    const normalized = query.trim();
    if (!normalized) return [];
    const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
    const pattern = `%${escapeLike(normalized)}%`;
    const rows = this._database
      .prepare(
        `SELECT user_id, username, password_hash, name, created_at
         FROM workspace_users
         WHERE username LIKE ? ESCAPE '\\' COLLATE NOCASE
            OR name LIKE ? ESCAPE '\\' COLLATE NOCASE
         ORDER BY
           CASE WHEN username = ? COLLATE NOCASE THEN 0 ELSE 1 END,
           username COLLATE NOCASE ASC
         LIMIT ?`
      )
      .all(pattern, pattern, normalized, safeLimit) as unknown as UserRow[];
    return rows.map(toUser);
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._database.close();
  }

  private _getRowByUsername(username: string): UserRow | undefined {
    this._assertOpen();
    return this._database
      .prepare(
        `SELECT user_id, username, password_hash, name, created_at
         FROM workspace_users WHERE username = ? COLLATE NOCASE`
      )
      .get(username) as UserRow | undefined;
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error("UserStore is disposed");
  }
}

export class AuthService {
  private readonly _sessions = new Map<
    string,
    { readonly userId: string; readonly expiresAt: number }
  >();

  constructor(private readonly _users: UserStore) {}

  async register(
    username: string,
    password: string
  ): Promise<{ readonly token: string; readonly user: DemoUser }> {
    const user = await this._users.create(username, password);
    return { token: this._createSession(user.userId), user };
  }

  async login(
    username: string,
    password: string
  ): Promise<{ readonly token: string; readonly user: DemoUser }> {
    const user = await this._users.authenticate(username, password);
    if (!user) {
      throw new CollabError("UNAUTHENTICATED", "用户名或密码错误");
    }
    return { token: this._createSession(user.userId), user };
  }

  requireUser(request: IncomingMessage): DemoUser {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    const session = token ? this._sessions.get(token) : undefined;
    if (!token || !session || session.expiresAt <= Date.now()) {
      if (token) this._sessions.delete(token);
      throw new CollabError("UNAUTHENTICATED", "请先登录");
    }
    const user = this._users.getById(session.userId);
    if (!user) {
      this._sessions.delete(token);
      throw new CollabError("UNAUTHENTICATED", "登录用户不存在");
    }
    return user;
  }

  setCookie(response: Response, token: string): void {
    response.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
  }

  logout(request: IncomingMessage, response: Response): void {
    const token = readCookie(request.headers.cookie, COOKIE_NAME);
    if (token) this._sessions.delete(token);
    response.clearCookie(COOKIE_NAME, { path: "/" });
  }

  private _createSession(userId: string): string {
    const token = randomBytes(32).toString("base64url");
    this._sessions.set(token, {
      userId,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  }
}

function normalizeUsername(value: string): string {
  const username = value.trim();
  if (!/^[\p{L}\p{N}._-]{3,32}$/u.test(username)) {
    throw new CollabError(
      "INVALID_REQUEST",
      "用户名需为 3–32 位字母、数字、点、下划线或连字符"
    );
  }
  return username;
}

function validatePassword(password: string): void {
  if (password.length < 8 || password.length > 128) {
    throw new CollabError("INVALID_REQUEST", "密码长度需为 8–128 个字符");
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("base64url")}.${key.toString("base64url")}`;
}

async function verifyPassword(
  password: string,
  encoded: string
): Promise<boolean> {
  const [saltValue, keyValue] = encoded.split(".");
  if (!saltValue || !keyValue) return false;
  const expected = Buffer.from(keyValue, "base64url");
  const actual = (await scrypt(
    password,
    Buffer.from(saltValue, "base64url"),
    expected.length
  )) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

function toUser(row: UserRow): DemoUser {
  return {
    userId: row.user_id,
    username: row.username,
    name: row.name,
    createdAt: row.created_at,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
