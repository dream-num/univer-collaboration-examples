-- Initial schema for the multi-node example.
-- PostgreSQL runs this once when it initializes an empty data directory
-- (mounted at /docker-entrypoint-initdb.d in compose.yaml). The collaboration
-- nodes only check that the tables exist; they never run DDL themselves.
-- In production, manage this file with your migration tool instead.

-- Tables used by server/postgres-database-adapter.ts.
CREATE SCHEMA IF NOT EXISTS collaboration;
CREATE TABLE IF NOT EXISTS collaboration.units (
  unit_id TEXT PRIMARY KEY,
  type INTEGER NOT NULL,
  head_revision INTEGER NOT NULL CHECK (head_revision >= 1),
  creator_id TEXT NOT NULL,
  created_at_ms BIGINT NOT NULL,
  deleted_at_ms BIGINT,
  deleted_status TEXT CHECK (deleted_status IN ('soft', 'hard')),
  CHECK ((deleted_status IS NULL) = (deleted_at_ms IS NULL))
);
CREATE TABLE IF NOT EXISTS collaboration.snapshots (
  unit_id TEXT NOT NULL REFERENCES collaboration.units(unit_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  payload BYTEA NOT NULL,
  PRIMARY KEY (unit_id, revision)
);
CREATE TABLE IF NOT EXISTS collaboration.changesets (
  unit_id TEXT NOT NULL REFERENCES collaboration.units(unit_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 2),
  created_at_ms BIGINT NOT NULL,
  payload BYTEA NOT NULL,
  PRIMARY KEY (unit_id, revision)
);
CREATE TABLE IF NOT EXISTS collaboration.sheet_blocks (
  unit_id TEXT NOT NULL REFERENCES collaboration.units(unit_id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  payload BYTEA NOT NULL,
  PRIMARY KEY (unit_id, block_id)
);

-- Application catalog: the file list shown in the sidebar.
CREATE TABLE IF NOT EXISTS files (
  unit_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
