import { UnitAction } from "@univerjs/protocol";
import type { UnitRoleName } from "../shared/types";

export const UNIT_ID = "object-permissions-sheet";
export const UNIT_NAME = "Object Permissions Sheet";

/**
 * This is a demo application policy. Real applications should define their own
 * role-to-action mapping and may introduce roles such as "commenter".
 *
 * Unit roles gate the document as a whole; object-level ACLs in acl.ts further
 * restrict protected worksheets and ranges within it.
 */
const roleRank: Record<UnitRoleName, number> = { viewer: 0, editor: 1, creator: 2 };

const rolesByUnit = new Map<string, ReadonlyMap<string, UnitRoleName>>([
  [
    UNIT_ID,
    new Map([
      ["user-alice", "creator"],
      ["user-bob", "editor"],
      ["user-casey", "viewer"],
    ]),
  ],
]);

export function resolveUnitRole(userID: string, unitID: string) {
  return rolesByUnit.get(unitID)?.get(userID);
}

const readActions = new Set<UnitAction>([
  UnitAction.View,
  UnitAction.Copy,
  UnitAction.SelectProtectedCells,
  UnitAction.SelectUnProtectedCells,
]);
const editActions = new Set<UnitAction>([
  UnitAction.Edit,
  UnitAction.MoveSheet,
  UnitAction.DeleteSheet,
  UnitAction.HideSheet,
  UnitAction.CopySheet,
  UnitAction.RenameSheet,
  UnitAction.CreateSheet,
  UnitAction.SetCellStyle,
  UnitAction.SetCellValue,
  UnitAction.SetRowStyle,
  UnitAction.SetColumnStyle,
  UnitAction.InsertRow,
  UnitAction.InsertColumn,
  UnitAction.DeleteRow,
  UnitAction.DeleteColumn,
  UnitAction.InsertHyperlink,
  UnitAction.Sort,
  UnitAction.Filter,
  UnitAction.EditExtraObject,
  // Editors may create protection objects; only the object creator manages them afterwards.
  UnitAction.CreatePermissionObject,
]);
const manageActions = new Set<UnitAction>([UnitAction.ManageCollaborator, UnitAction.Delete]);

// Share the policy between client permission queries and server checks.
export function isUnitActionAllowed(userID: string, unitID: string, action: UnitAction) {
  const role = resolveUnitRole(userID, unitID);
  if (!role) return false;
  if (readActions.has(action)) return true;
  if (editActions.has(action)) return roleRank[role] >= roleRank.editor;
  if (manageActions.has(action)) return role === "creator";
  return false;
}
