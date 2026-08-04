-- Display cloud synchronization

ALTER TABLE displays ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE displays ADD COLUMN sync_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE displays ADD COLUMN last_sync_attempt_at TEXT;
ALTER TABLE displays ADD COLUMN synced_at TEXT;
ALTER TABLE displays ADD COLUMN sync_error TEXT;
ALTER TABLE displays ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE displays ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS display_sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  last_error TEXT,
  sync_state TEXT NOT NULL DEFAULT 'pending',
  source_instance_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_display_sync_queue_state
  ON display_sync_queue (sync_state, last_attempt_at);

CREATE TABLE IF NOT EXISTS display_deletion_tombstones (
  display_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  deleted_by_user_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  sync_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_sync_attempt_at TEXT,
  synced_at TEXT,
  sync_error TEXT,
  source_instance_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_display_deletion_tombstones_sync
  ON display_deletion_tombstones (sync_status, last_sync_attempt_at);

ALTER TABLE project_code_revisions ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE project_code_revisions ADD COLUMN sync_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_code_revisions ADD COLUMN last_sync_attempt_at TEXT;
ALTER TABLE project_code_revisions ADD COLUMN synced_at TEXT;
ALTER TABLE project_code_revisions ADD COLUMN sync_error TEXT;
ALTER TABLE project_code_revisions ADD COLUMN content_hash TEXT;
