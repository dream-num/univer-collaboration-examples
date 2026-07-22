CREATE TABLE IF NOT EXISTS demo_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_guests (
  guest_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_history (
  unit_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  commands_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  restored_revision INTEGER,
  PRIMARY KEY (unit_id, revision),
  FOREIGN KEY (unit_id) REFERENCES units(unit_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES demo_guests(guest_id)
);

CREATE INDEX IF NOT EXISTS demo_history_latest
  ON demo_history(unit_id, revision DESC);
