import type Database from "libsql";

const statements = [
  `CREATE TABLE IF NOT EXISTS app_users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    locale TEXT NOT NULL CHECK (locale IN ('zh-CN', 'en-US')),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_units (
    unit_id TEXT PRIMARY KEY,
    type INTEGER NOT NULL,
    name TEXT NOT NULL,
    creator_user_id TEXT NOT NULL REFERENCES app_users(user_id),
    state TEXT NOT NULL CHECK (state IN ('creating', 'active', 'deleting', 'deleted', 'recovering')),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    deleted_at_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS app_unit_members (
    unit_id TEXT NOT NULL REFERENCES app_units(unit_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (unit_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS app_permission_objects (
    object_id TEXT PRIMARY KEY,
    unit_id TEXT NOT NULL REFERENCES app_units(unit_id) ON DELETE CASCADE,
    object_type INTEGER NOT NULL,
    creator_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    strategies_json TEXT NOT NULL,
    scope_json TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    UNIQUE (unit_id, object_id)
  )`,
  `CREATE TABLE IF NOT EXISTS app_permission_object_collaborators (
    unit_id TEXT NOT NULL,
    object_id TEXT NOT NULL,
    user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
    role INTEGER NOT NULL CHECK (role IN (0, 1, 2)),
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (unit_id, object_id, user_id),
    FOREIGN KEY (unit_id, object_id)
      REFERENCES app_permission_objects(unit_id, object_id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id
    ON app_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at_ms
    ON app_sessions(expires_at_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_app_units_creator_state_updated
    ON app_units(creator_user_id, state, updated_at_ms DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_app_unit_members_user_unit
    ON app_unit_members(user_id, unit_id)`,
  `CREATE INDEX IF NOT EXISTS idx_app_permission_collaborators_user
    ON app_permission_object_collaborators(user_id, unit_id, object_id)`,
] as const;

export function initializeSchema(database: Database.Database) {
  for (const statement of statements) database.exec(statement);
}
