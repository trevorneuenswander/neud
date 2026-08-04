CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  sequence_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  source TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  actor_json TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_activity_events_sequence
  ON activity_events (sequence_id DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp
  ON activity_events (timestamp DESC);
