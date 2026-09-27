import { UnitAction } from "@univerjs/protocol";
import type { DocumentRole } from "../shared/types";

export const UNIT_ID = "permissions-sheet";
export const UNIT_NAME = "Permissions Sheet";

const roles = new Map<string, DocumentRole>([
  ["user-alice", "creator"],
  ["user-bob", "editor"],
  ["user-casey", "viewer"],
]);

export function resolveRole(userID: string, unitID: string) {
  if (unitID !== UNIT_ID) return undefined;
  return roles.get(userID);
}

const readActions = new Set<UnitAction>([
  UnitAction.View,
  UnitAction.Copy,
  UnitAction.Comment,
  UnitAction.ViewHistory,
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
  UnitAction.PivotTable,
  UnitAction.Print,
  UnitAction.Export,
  UnitAction.RecoverHistory,
  UnitAction.SelectProtectedCells,
  UnitAction.SelectUnProtectedCells,
  UnitAction.EditExtraObject,
  UnitAction.CreatePermissionObject,
]);
const manageActions = new Set<UnitAction>([UnitAction.ManageCollaborator, UnitAction.Delete]);

const roleRank: Record<DocumentRole, number> = { viewer: 0, editor: 1, creator: 2 };

// Share the policy between client permission queries and server checks.
export function isAllowed(userID: string, unitID: string, action: UnitAction) {
  const role = resolveRole(userID, unitID);
  if (!role) return false;
  if (readActions.has(action)) return true;
  if (editActions.has(action)) return roleRank[role] >= roleRank.editor;
  if (manageActions.has(action)) return role === "creator";
  return false;
}
