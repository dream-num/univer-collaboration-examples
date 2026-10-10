import type Database from "libsql";
import type {
  AppUnit,
  UnitMember,
  UnitRole,
  UnitState,
} from "../../shared/api-types";

export type { AppUnit, UnitMember, UnitRole, UnitState };

export interface AppUserSummary {
  userId: string;
  displayName: string;
  createdAt: number;
}

interface MemberRow {
  user_id: string;
  username: string;
  display_name: string;
  role: UnitRole;
}

interface UnitRow {
  unit_id: string;
  type: number;
  name: string;
  creator_user_id: string;
  creator_display_name: string;
  member_role: "editor" | "viewer" | null;
  state: UnitState;
  created_at_ms: number;
  updated_at_ms: number;
  deleted_at_ms: number | null;
}

interface UserSummaryRow {
  user_id: string;
  display_name: string;
  created_at_ms: number;
}

function rowRole(row: UnitRow, userId: string): UnitRole | undefined {
  if (row.creator_user_id === userId) return "creator";
  return row.member_role ?? undefined;
}

function toUnit(row: UnitRow, userId: string): AppUnit | undefined {
  const role = rowRole(row, userId);
  if (!role) return undefined;
  return {
    unitId: row.unit_id,
    type: row.type,
    name: row.name,
    creatorDisplayName: row.creator_display_name,
    role,
    state: row.state,
    createdAt: row.created_at_ms,
    updatedAt: row.updated_at_ms,
    ...(row.deleted_at_ms == null ? {} : { deletedAt: row.deleted_at_ms }),
  };
}

export function createUnitRepository(database: Database.Database) {
  const listUnits = database.prepare(
    `SELECT u.unit_id, u.type, u.name, u.creator_user_id,
      creator.display_name AS creator_display_name,
      m.role AS member_role, u.state, u.created_at_ms, u.updated_at_ms,
      u.deleted_at_ms
    FROM app_units u
    JOIN app_users creator ON creator.user_id = u.creator_user_id
    LEFT JOIN app_unit_members m
      ON m.unit_id = u.unit_id AND m.user_id = ?
    WHERE u.state = 'active'
      AND (u.creator_user_id = ? OR m.user_id IS NOT NULL)
    ORDER BY u.updated_at_ms DESC, u.unit_id`,
  );
  const listTrash = database.prepare(
    `SELECT u.unit_id, u.type, u.name, u.creator_user_id,
      creator.display_name AS creator_display_name,
      NULL AS member_role, u.state, u.created_at_ms, u.updated_at_ms,
      u.deleted_at_ms
    FROM app_units u
    JOIN app_users creator ON creator.user_id = u.creator_user_id
    WHERE u.state = 'deleted' AND u.creator_user_id = ?
    ORDER BY u.deleted_at_ms DESC, u.unit_id`,
  );
  const findUnit = database.prepare(
    `SELECT u.unit_id, u.type, u.name, u.creator_user_id,
      creator.display_name AS creator_display_name,
      m.role AS member_role, u.state, u.created_at_ms, u.updated_at_ms,
      u.deleted_at_ms
    FROM app_units u
    JOIN app_users creator ON creator.user_id = u.creator_user_id
    LEFT JOIN app_unit_members m
      ON m.unit_id = u.unit_id AND m.user_id = ?
    WHERE u.unit_id = ?`,
  );
  const insertUnit = database.prepare(
    `INSERT INTO app_units (
      unit_id, type, name, creator_user_id, state,
      created_at_ms, updated_at_ms, deleted_at_ms
    ) VALUES (?, ?, ?, ?, 'creating', ?, ?, NULL)`,
  );
  const activateUnit = database.prepare(
    `UPDATE app_units SET state = 'active', updated_at_ms = ?
    WHERE unit_id = ? AND state = 'creating'`,
  );
  const deleteCreatingUnit = database.prepare(
    "DELETE FROM app_units WHERE unit_id = ? AND state = 'creating'",
  );
  const listMembers = database.prepare(
    `SELECT users.user_id, users.username, users.display_name, 'creator' AS role
    FROM app_units units
    JOIN app_users users ON users.user_id = units.creator_user_id
    WHERE units.unit_id = ?
    UNION ALL
    SELECT users.user_id, users.username, users.display_name, members.role
    FROM app_unit_members members
    JOIN app_users users ON users.user_id = members.user_id
    WHERE members.unit_id = ?
    ORDER BY role, username COLLATE NOCASE`,
  );
  const findUserByUsername = database.prepare(
    `SELECT user_id, username, display_name
    FROM app_users WHERE username = ? COLLATE NOCASE`,
  );
  const findCreator = database.prepare(
    "SELECT creator_user_id FROM app_units WHERE unit_id = ?",
  );
  const beginDelete = database.prepare(
    `UPDATE app_units SET state = 'deleting', updated_at_ms = ?
    WHERE unit_id = ? AND creator_user_id = ? AND state = 'active'`,
  );
  const finishDelete = database.prepare(
    `UPDATE app_units SET state = 'deleted', updated_at_ms = ?, deleted_at_ms = ?
    WHERE unit_id = ? AND state = 'deleting'`,
  );
  const rollbackDelete = database.prepare(
    `UPDATE app_units SET state = 'active', updated_at_ms = ?
    WHERE unit_id = ? AND state = 'deleting'`,
  );
  const beginRecover = database.prepare(
    `UPDATE app_units SET state = 'recovering', updated_at_ms = ?
    WHERE unit_id = ? AND creator_user_id = ? AND state = 'deleted'`,
  );
  const finishRecover = database.prepare(
    `UPDATE app_units SET state = 'active', updated_at_ms = ?, deleted_at_ms = NULL
    WHERE unit_id = ? AND state = 'recovering'`,
  );
  const rollbackRecover = database.prepare(
    `UPDATE app_units SET state = 'deleted', updated_at_ms = ?
    WHERE unit_id = ? AND state = 'recovering'`,
  );
  const touchUnit = database.prepare(
    `UPDATE app_units SET updated_at_ms = ?
    WHERE unit_id = ? AND state = 'active'`,
  );
  const renameUnit = database.prepare(
    `UPDATE app_units SET name = ?, updated_at_ms = ?
    WHERE unit_id = ? AND state = 'active'
      AND (creator_user_id = ? OR EXISTS (
        SELECT 1 FROM app_unit_members
        WHERE app_unit_members.unit_id = app_units.unit_id
          AND app_unit_members.user_id = ?
          AND app_unit_members.role = 'editor'
      ))`,
  );
  const upsertMember = database.prepare(
    `INSERT INTO app_unit_members (
      unit_id, user_id, role, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(unit_id, user_id) DO UPDATE SET
      role = excluded.role,
      updated_at_ms = excluded.updated_at_ms`,
  );
  const deleteMember = database.prepare(
    "DELETE FROM app_unit_members WHERE unit_id = ? AND user_id = ?",
  );
  const findUserById = database.prepare(
    `SELECT user_id, display_name, created_at_ms
    FROM app_users WHERE user_id = ?`,
  );
  return {
    listUnits(userId: string) {
      return (listUnits.all(userId, userId) as UnitRow[])
        .map((row) => toUnit(row, userId))
        .filter((unit): unit is AppUnit => Boolean(unit));
    },
    listTrash(userId: string) {
      return (listTrash.all(userId) as UnitRow[])
        .map((row) => toUnit(row, userId))
        .filter((unit): unit is AppUnit => Boolean(unit));
    },
    getUnit(userId: string, unitId: string) {
      const row = findUnit.get(userId, unitId) as UnitRow | undefined;
      return row ? toUnit(row, userId) : undefined;
    },
    resolveRole(userId: string, unitId: string) {
      const unit = this.getUnit(userId, unitId);
      return unit?.state === "active" ? unit.role : undefined;
    },
    isCreator(userId: string, unitId: string) {
      const row = findCreator.get(unitId) as
        | { creator_user_id: string }
        | undefined;
      return row?.creator_user_id === userId;
    },
    beginCreate(input: {
      unitId: string;
      type: number;
      name: string;
      creatorUserId: string;
    }) {
      const now = Date.now();
      insertUnit.run(
        input.unitId,
        input.type,
        input.name,
        input.creatorUserId,
        now,
        now,
      );
    },
    finishCreate(unitId: string) {
      activateUnit.run(Date.now(), unitId);
    },
    abortCreate(unitId: string) {
      deleteCreatingUnit.run(unitId);
    },
    beginDelete(unitId: string, creatorUserId: string) {
      const result = beginDelete.run(Date.now(), unitId, creatorUserId) as {
        changes: number;
      };
      return result.changes === 1;
    },
    finishDelete(unitId: string) {
      const now = Date.now();
      finishDelete.run(now, now, unitId);
    },
    rollbackDelete(unitId: string) {
      rollbackDelete.run(Date.now(), unitId);
    },
    beginRecover(unitId: string, creatorUserId: string) {
      const result = beginRecover.run(Date.now(), unitId, creatorUserId) as {
        changes: number;
      };
      return result.changes === 1;
    },
    finishRecover(unitId: string) {
      finishRecover.run(Date.now(), unitId);
    },
    rollbackRecover(unitId: string) {
      rollbackRecover.run(Date.now(), unitId);
    },
    touchUnit(unitId: string, updatedAt = Date.now()) {
      touchUnit.run(updatedAt, unitId);
    },
    renameUnit(unitId: string, userId: string, name: string) {
      const result = renameUnit.run(name, Date.now(), unitId, userId, userId) as {
        changes: number;
      };
      return result.changes === 1;
    },
    listMembers(unitId: string): UnitMember[] {
      return (listMembers.all(unitId, unitId) as MemberRow[]).map((row) => ({
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
      }));
    },
    setMemberByUsername(
      unitId: string,
      username: string,
      role: "editor" | "viewer",
    ): UnitMember | undefined {
      const user = findUserByUsername.get(username) as
        | Omit<MemberRow, "role">
        | undefined;
      if (!user) return undefined;
      const creator = findCreator.get(unitId) as
        | { creator_user_id: string }
        | undefined;
      if (!creator || creator.creator_user_id === user.user_id) return undefined;
      const now = Date.now();
      upsertMember.run(unitId, user.user_id, role, now, now);
      return {
        userId: user.user_id,
        username: user.username,
        displayName: user.display_name,
        role,
      };
    },
    removeMember(unitId: string, userId: string) {
      deleteMember.run(unitId, userId);
    },
    getUsers(userIds: readonly string[]): AppUserSummary[] {
      return [...new Set(userIds)].flatMap((userId) => {
        const row = findUserById.get(userId) as UserSummaryRow | undefined;
        return row
          ? [{
              userId: row.user_id,
              displayName: row.display_name,
              createdAt: row.created_at_ms,
            }]
          : [];
      });
    },
  };
}

export type UnitRepository = ReturnType<typeof createUnitRepository>;
