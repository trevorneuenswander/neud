-- 034_project_photo_uploads.sql
-- Persisted cloud photo upload lifecycle for manual/local-only photos.

CREATE TABLE IF NOT EXISTS project_photo_uploads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  lot_key TEXT,
  display_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  storage_object_id TEXT,
  original_filename TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'uploading', 'uploaded', 'failed', 'orphan_candidate')
  ),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_project_photo_uploads_project
  ON project_photo_uploads (project_id);

CREATE INDEX IF NOT EXISTS idx_project_photo_uploads_display_url
  ON project_photo_uploads (project_id, display_url);

CREATE INDEX IF NOT EXISTS idx_project_photo_uploads_status
  ON project_photo_uploads (status);
