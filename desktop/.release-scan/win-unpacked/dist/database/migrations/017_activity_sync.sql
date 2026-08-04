-- Activity cloud synchronization columns

ALTER TABLE activity_events ADD COLUMN cloud_id TEXT;
ALTER TABLE activity_events ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE activity_events ADD COLUMN sync_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE activity_events ADD COLUMN last_sync_attempt_at TEXT;
ALTER TABLE activity_events ADD COLUMN synced_at TEXT;
ALTER TABLE activity_events ADD COLUMN sync_error TEXT;
ALTER TABLE activity_events ADD COLUMN source_instance_id TEXT;
ALTER TABLE activity_events ADD COLUMN cloud_updated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_cloud_id
  ON activity_events (cloud_id)
  WHERE cloud_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_events_sync_status
  ON activity_events (sync_status, last_sync_attempt_at);

CREATE INDEX IF NOT EXISTS idx_activity_events_cloud_updated_at
  ON activity_events (cloud_updated_at DESC);
