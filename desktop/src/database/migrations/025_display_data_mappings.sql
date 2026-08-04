CREATE TABLE IF NOT EXISTS display_data_mappings (
  id TEXT PRIMARY KEY,
  display_id TEXT NOT NULL REFERENCES displays (id) ON DELETE CASCADE,
  json_path TEXT NOT NULL,
  target_selector TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_property TEXT,
  formatter TEXT,
  condition_json TEXT,
  fallback_value TEXT,
  sort_order REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  sync_version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_display_data_mappings_display
  ON display_data_mappings (display_id, deleted_at, sort_order);

CREATE TABLE IF NOT EXISTS display_data_mapping_deletion_tombstones (
  mapping_id TEXT PRIMARY KEY,
  display_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  deleted_by_user_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  sync_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_sync_attempt_at TEXT,
  synced_at TEXT,
  sync_error TEXT,
  source_instance_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_display_data_mapping_tombstones_sync
  ON display_data_mapping_deletion_tombstones (sync_status, last_sync_attempt_at);
