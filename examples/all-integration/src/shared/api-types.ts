export type Locale = "zh-CN" | "en-US";
export type UnitRole = "creator" | "editor" | "viewer";
export type UnitState =
  | "creating"
  | "active"
  | "deleting"
  | "deleted"
  | "recovering";

export interface User {
  userId: string;
  username: string;
  displayName: string;
  locale: Locale;
}

export interface AppUnit {
  unitId: string;
  type: number;
  name: string;
  creatorDisplayName: string;
  role: UnitRole;
  state: UnitState;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface UnitMember {
  userId: string;
  username: string;
  displayName: string;
  role: UnitRole;
}
