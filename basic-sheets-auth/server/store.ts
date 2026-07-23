import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import type { AuthenticatedUser, UnitRole } from "./model.js";

const scrypt = promisify(scryptCallback);

const PRESET_USERS = [
  {
    userId: "user-alice",
    username: "alice",
    name: "Alice",
    password: "alice-password",
  },
  {
    userId: "user-bob",
    username: "bob",
    name: "Bob",
    password: "bob-password",
  },
] as const;

interface UserRow {
  readonly user_id: string;
  readonly username: string;
  readonly name: string;
  readonly password_hash: string;
  readonly created_at: number;
}

interface AccessRow {
  readonly user_id: string;
  readonly role: UnitRole;
}

/** Auth 与 ACL 属于应用层；它们和协同数据共用 demo SQLite 文件。 */
export class ApplicationStore {
  private readonly _database: DatabaseSync;
  private _disposed = false;

  constructor(filename: string) {
    this._database = new DatabaseSync(filename);
    this._database.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS basic_auth_users (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS basic_auth_unit_access (
        unit_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
        PRIMARY KEY (unit_id, user_id)
      );
    `);
  }

  async ensurePresetUsers(): Promise<void> {
    this._assertOpen();
    for (const preset of PRESET_USERS) {
      const passwordHash = await hashPassword(preset.password);
      this._database
        .prepare(
          `INSERT INTO basic_auth_users
            (user_id, username, name, password_hash, created_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             username = excluded.username,
             name = excluded.name,
             password_hash = excluded.password_hash`
        )
        .run(
          preset.userId,
          preset.username,
          preset.name,
          passwordHash,
          Date.now()
        );
    }
  }

  async authenticate(
    username: string,
    password: string
  ): Promise<AuthenticatedUser | null> {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT user_id, username, name, password_hash, created_at
         FROM basic_auth_users WHERE username = ? COLLATE NOCASE`
      )
      .get(username.trim()) as UserRow | undefined;
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return null;
    }
    return toUser(row);
  }

  getUser(userId: string): AuthenticatedUser | null {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT user_id, username, name, password_hash, created_at
         FROM basic_auth_users WHERE user_id = ?`
      )
      .get(userId) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  listUsers(): readonly AuthenticatedUser[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT user_id, username, name, password_hash, created_at
         FROM basic_auth_users ORDER BY username COLLATE NOCASE`
      )
      .all() as unknown as UserRow[];
    return rows.map(toUser);
  }

  getRole(userId: string, unitID: string): UnitRole | undefined {
    this._assertOpen();
    const row = this._database
      .prepare(
        `SELECT user_id, role FROM basic_auth_unit_access
         WHERE unit_id = ? AND user_id = ?`
      )
      .get(unitID, userId) as AccessRow | undefined;
    return row?.role;
  }

  setRole(userId: string, unitID: string, role: UnitRole): void {
    this._assertOpen();
    this._database
      .prepare(
        `INSERT INTO basic_auth_unit_access (unit_id, user_id, role)
         VALUES (?, ?, ?)
         ON CONFLICT(unit_id, user_id) DO UPDATE SET role = excluded.role`
      )
      .run(unitID, userId, role);
  }

  removeRole(userId: string, unitID: string): void {
    this._assertOpen();
    this._database
      .prepare(
        `DELETE FROM basic_auth_unit_access WHERE unit_id = ? AND user_id = ?`
      )
      .run(unitID, userId);
  }

  listMembers(
    unitID: string
  ): readonly { readonly user: AuthenticatedUser; readonly role: UnitRole }[] {
    this._assertOpen();
    const rows = this._database
      .prepare(
        `SELECT u.user_id, u.username, u.name, u.password_hash, u.created_at,
                a.role
         FROM basic_auth_unit_access a
         JOIN basic_auth_users u ON u.user_id = a.user_id
         WHERE a.unit_id = ?
         ORDER BY CASE a.role WHEN 'owner' THEN 0 ELSE 1 END, u.username`
      )
      .all(unitID) as unknown as Array<UserRow & { readonly role: UnitRole }>;
    return rows.map((row) => ({ user: toUser(row), role: row.role }));
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._database.close();
  }

  private _assertOpen(): void {
    if (this._disposed) throw new Error("ApplicationStore is disposed");
  }
}

function toUser(row: UserRow): AuthenticatedUser {
  return {
    userId: row.user_id,
    username: row.username,
    name: row.name,
    createdAt: row.created_at,
  };
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 32)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = (await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length
  )) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
