import type { ObjectScope, UnitAction, UnitObject, UnitRole } from "@univerjs/protocol";

export interface PermissionStrategy {
  action: UnitAction;
  role: UnitRole;
}

export interface PermissionObjectScope {
  read: ObjectScope;
  edit: ObjectScope;
}

export interface PermissionObject {
  objectId: string;
  unitId: string;
  objectType: UnitObject;
  creatorUserId: string;
  name: string;
  strategies: PermissionStrategy[];
  scope: PermissionObjectScope | undefined;
}

export interface ObjectCollaborator {
  userId: string;
  role: UnitRole;
}
