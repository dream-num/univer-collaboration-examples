-- Initial schema for the multi-node example.
-- PostgreSQL runs this once when it initializes an empty data directory
-- (mounted at /docker-entrypoint-initdb.d in compose.yaml). The collaboration
-- nodes only verify on startup that the schema is present and at the expected
-- version; they never create tables themselves.
-- In production, manage this file with your migration tool instead.

-- Collaboration tables. This is the schema that
-- @univerjs-pro/collaboration-database-postgres creates on an empty database;
-- the version row lets the Adapter verify it instead of creating it.
CREATE SCHEMA IF NOT EXISTS collaboration;
CREATE TABLE IF NOT EXISTS collaboration.schema_versions (
  component TEXT PRIMARY KEY,
  version INTEGER NOT NULL CHECK (version >= 1)
);
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
  base_revision INTEGER NOT NULL CHECK (base_revision >= 1),
  sid TEXT NOT NULL,
  req_id INTEGER NOT NULL CHECK (req_id >= 1),
  created_at_ms BIGINT NOT NULL,
  payload BYTEA NOT NULL,
  PRIMARY KEY (unit_id, revision),
  UNIQUE (unit_id, sid, req_id)
);
CREATE TABLE IF NOT EXISTS collaboration.sheet_blocks (
  unit_id TEXT NOT NULL REFERENCES collaboration.units(unit_id) ON DELETE CASCADE,
  block_id TEXT NOT NULL,
  payload BYTEA NOT NULL,
  PRIMARY KEY (unit_id, block_id)
);
INSERT INTO collaboration.schema_versions (component, version)
VALUES ('core', 1)
ON CONFLICT (component) DO NOTHING;

-- Application catalog: the file list shown in the sidebar.
CREATE TABLE IF NOT EXISTS files (
  unit_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
