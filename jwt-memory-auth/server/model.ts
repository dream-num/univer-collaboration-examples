export type DocumentRole = "admin" | "editor" | "viewer";

export interface UserRecord {
  userId: string;
  username: string;
  passwordHash: string;
}

export interface AuthenticatedUser {
  userId: string;
  username: string;
}

/** 创建用户时输入明文密码；MemoryUserStore 只保存密码哈希。 */
export interface CreateUserInput {
  userId: string;
  username: string;
  password: string;
}

export function canRead(role: DocumentRole | undefined): boolean {
  return role === "viewer" || role === "editor" || role === "admin";
}

export function canEdit(role: DocumentRole | undefined): boolean {
  return role === "editor" || role === "admin";
}

export function canAdmin(role: DocumentRole | undefined): boolean {
  return role === "admin";
}
