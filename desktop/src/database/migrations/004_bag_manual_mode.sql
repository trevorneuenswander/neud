ALTER TABLE bag_live_state ADD COLUMN automatic_state_json TEXT;
ALTER TABLE bag_live_state ADD COLUMN manual_state_json TEXT;
ALTER TABLE bag_live_state ADD COLUMN manual_started_at TEXT;
ALTER TABLE bag_live_state ADD COLUMN manual_started_by TEXT;

CREATE TABLE IF NOT EXISTS bag_manual_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  previous_value_json TEXT,
  next_value_json TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_bag_manual_events_project
  ON bag_manual_events (project_id, created_at DESC);
