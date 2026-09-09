import { UnitAction } from "@univerjs/protocol";
import type { UnitRole } from "./units/units.repository";

const roleRank: Record<UnitRole, number> = {
  viewer: 0,
  editor: 1,
  creator: 2,
};

/**
 * This is a demo application policy. Real applications should define their own
 * role-to-permission mapping and may introduce roles such as "commenter".
 */
const minimumRoleByAction = new Map<number, UnitRole>([
  [UnitAction.View, "viewer"],
  [UnitAction.Copy, "viewer"],
  [UnitAction.Share, "viewer"],
  [UnitAction.Comment, "viewer"],
  [UnitAction.ViewHistory, "viewer"],

  [UnitAction.Edit, "editor"],
  [UnitAction.Print, "editor"],
  [UnitAction.Duplicate, "editor"],
  [UnitAction.Export, "editor"],
  [UnitAction.MoveSheet, "editor"],
  [UnitAction.DeleteSheet, "editor"],
  [UnitAction.HideSheet, "editor"],
  [UnitAction.CopySheet, "editor"],
  [UnitAction.RenameSheet, "editor"],
  [UnitAction.CreateSheet, "editor"],
  [UnitAction.SetCellStyle, "editor"],
  [UnitAction.SetCellValue, "editor"],
  [UnitAction.InsertHyperlink, "editor"],
  [UnitAction.Sort, "editor"],
  [UnitAction.Filter, "editor"],
  [UnitAction.PivotTable, "editor"],
  [UnitAction.RecoverHistory, "editor"],
  [UnitAction.SelectProtectedCells, "editor"],
  [UnitAction.SelectUnProtectedCells, "editor"],
  [UnitAction.SetRowStyle, "editor"],
  [UnitAction.SetColumnStyle, "editor"],
  [UnitAction.InsertRow, "editor"],
  [UnitAction.InsertColumn, "editor"],
  [UnitAction.DeleteRow, "editor"],
  [UnitAction.DeleteColumn, "editor"],
  [UnitAction.EditExtraObject, "editor"],
  [UnitAction.CreatePermissionObject, "editor"],

  [UnitAction.ManageCollaborator, "creator"],
  [UnitAction.Delete, "creator"],
]);

export function isUnitActionAllowed(
  role: UnitRole | undefined,
  action: number,
): boolean {
  const minimumRole = minimumRoleByAction.get(action);
  if (!role || !minimumRole) return false;
  return roleRank[role] >= roleRank[minimumRole];
}
