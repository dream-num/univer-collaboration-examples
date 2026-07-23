import { UnitAction } from "@univerjs/protocol";

export type UnitRole = "owner" | "editor" | "viewer";

export interface AuthenticatedUser {
  readonly userId: string;
  readonly username: string;
  readonly name: string;
  readonly createdAt: number;
}

export function protocolUser(user: AuthenticatedUser) {
  return {
    userID: user.userId,
    name: user.name,
    avatar: "",
    anonymous: false,
    canBindAnonymous: false,
    phone: "",
    email: "",
    createTimestamp: user.createdAt,
  };
}

export function canRead(role: UnitRole | undefined): boolean {
  return role !== undefined;
}

export function canEdit(role: UnitRole | undefined): boolean {
  return role === "owner" || role === "editor";
}

export function canManageMembers(role: UnitRole | undefined): boolean {
  return role === "owner";
}

export function isUnitActionAllowed(
  role: UnitRole | undefined,
  action: unknown
): boolean {
  if (!role || typeof action !== "number") return false;
  if (action === UnitAction.Share) return false;
  if (role === "owner") return true;
  if (role === "editor") {
    return ![
      UnitAction.ManageCollaborator,
      UnitAction.Delete,
    ].includes(action);
  }
  return [
    UnitAction.View,
    UnitAction.Print,
    UnitAction.Copy,
    UnitAction.Export,
    UnitAction.IHistory,
    UnitAction.ViemRwHgtClWdt,
    UnitAction.ViewFilter,
    UnitAction.SelectProtectedCells,
    UnitAction.SelectUnProtectedCells,
    UnitAction.ViewHistory,
  ].includes(action);
}
