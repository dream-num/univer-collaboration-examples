import { compare, hash } from "bcryptjs";
import type {
  AuthenticatedUser,
  CreateUserInput,
  DocumentRole,
  UserRecord,
} from "./model.js";

/** Demo 用户库。只存在于当前 Node 进程，重启后清空。 */
export class MemoryUserStore {
  private readonly usersById = new Map<string, UserRecord>();
  private readonly userIdByUsername = new Map<string, string>();

  async create(input: CreateUserInput): Promise<void> {
    if (
      this.usersById.has(input.userId) ||
      this.userIdByUsername.has(input.username)
    ) {
      throw new Error("User ID or username already exists");
    }

    this.usersById.set(input.userId, {
      userId: input.userId,
      username: input.username,
      passwordHash: await hash(input.password, 10),
    });
    this.userIdByUsername.set(input.username, input.userId);
  }

  async authenticate(
    username: string,
    password: string
  ): Promise<AuthenticatedUser | null> {
    const userId = this.userIdByUsername.get(username);
    const user = userId ? this.usersById.get(userId) : undefined;
    if (!user || !(await compare(password, user.passwordHash))) return null;
    return { userId: user.userId, username: user.username };
  }

  getById(userId: string): AuthenticatedUser | null {
    const user = this.usersById.get(userId);
    return user ? { userId: user.userId, username: user.username } : null;
  }

  list(): readonly AuthenticatedUser[] {
    return [...this.usersById.values()].map(({ userId, username }) => ({
      userId,
      username,
    }));
  }
}

function grantKey(userId: string, unitID: string): string {
  return `${unitID}\u0000${userId}`;
}

/** Demo ACL：一个用户在一个 unitID 上只有一个角色。 */
export class MemoryDocumentAccessStore {
  private readonly grants = new Map<string, DocumentRole>();

  getRole(userId: string, unitID: string): DocumentRole | undefined {
    return this.grants.get(grantKey(userId, unitID));
  }

  grant(userId: string, unitID: string, role: DocumentRole): void {
    this.grants.set(grantKey(userId, unitID), role);
  }

  revoke(userId: string, unitID: string): void {
    this.grants.delete(grantKey(userId, unitID));
  }
}
