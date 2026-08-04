-- 035_cloud_access_cache.sql
-- Transactional read-only cache for cloud access directory snapshots.

CREATE TABLE IF NOT EXISTS cloud_access_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  directory_json TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
