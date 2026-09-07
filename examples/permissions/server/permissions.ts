import { UnitAction } from "@univerjs/protocol";
import type { DocumentRole } from "../shared/types";

export const UNIT_ID = "permissions-sheet";
export const UNIT_NAME = "Permissions Sheet";

// Assign roles per user and document, separately from user profiles.
const rolesByUnit = new Map<string, ReadonlyMap<string, DocumentRole>>([
  [
    UNIT_ID,
    new Map([
      ["user-editor", "editor"],
      ["user-viewer", "viewer"],
    ]),
  ],
]);

export function resolveRole(userID: string, unitID: string) {
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
]);

// Share the policy between client permission queries and server checks.
export function isAllowed(userID: string, unitID: string, action: UnitAction) {
  const role = resolveRole(userID, unitID);
  if (!role) return false;
  return readActions.has(action) || (role === "editor" && editActions.has(action));
}
