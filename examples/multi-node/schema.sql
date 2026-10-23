-- Initial schema for the multi-node example: collaboration nodes and the exchange service.
-- PostgreSQL runs this once when it initializes an empty data directory
-- (mounted at /docker-entrypoint-initdb.d in compose.yaml). The collaboration
-- nodes and exchange replicas only check that the tables exist; they never run DDL themselves.
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

-- Import/export (exchange) service state, shared by every exchange replica.
-- A task is created as pending by the replica that accepts the request, moves to running when
-- that replica starts converting, and ends as done (with result) or failed (with error).
-- Any replica can answer the task poll because it reads this table instead of process memory.
CREATE TABLE IF NOT EXISTS exchange_tasks (
  task_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('import', 'export')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'done', 'failed')),
  result JSONB,
  error TEXT,
  created_at_ms BIGINT NOT NULL,
  updated_at_ms BIGINT NOT NULL,
  CHECK ((status = 'done') = (result IS NOT NULL)),
  CHECK ((status = 'failed') = (error IS NOT NULL))
);
-- Uploaded source files (deleted once imported) and exported results (served by any replica).
-- The example keeps the bytes in PostgreSQL; production deployments use object storage.
CREATE TABLE IF NOT EXISTS exchange_files (
  file_id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at_ms BIGINT NOT NULL
);
