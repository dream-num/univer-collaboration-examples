-- Stop both application nodes and back up PostgreSQL before running this migration.
-- Run with psql -v ON_ERROR_STOP=1. Existing snapshot and changeset payloads are preserved.
BEGIN;

DO $migration$
DECLARE
  current_version INTEGER;
BEGIN
  SELECT version INTO current_version
  FROM collaboration.schema_versions WHERE component = 'core';
  IF current_version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Expected collaboration core schema v1, found %', current_version;
  END IF;
END;
$migration$;

ALTER TABLE collaboration.units
  ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE collaboration.changesets
  ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE collaboration.schema_versions SET version = 2 WHERE component = 'core';

COMMIT;
