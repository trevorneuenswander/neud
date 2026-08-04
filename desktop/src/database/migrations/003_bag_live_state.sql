CREATE TABLE IF NOT EXISTS bag_live_state (
  project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  engine_id TEXT NOT NULL REFERENCES data_sources (id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'automatic',
  state_json TEXT NOT NULL,
  source_snapshot_id TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bag_live_state_engine ON bag_live_state (engine_id);
