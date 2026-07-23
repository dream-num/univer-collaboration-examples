CREATE TABLE IF NOT EXISTS example_history (
  unit_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  commands_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  restored_revision INTEGER,
  PRIMARY KEY (unit_id, revision),
  FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS example_history_latest
  ON example_history(unit_id, revision DESC);
