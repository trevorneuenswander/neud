-- Managed local media assets for video displays (ProRes 4444 foundation).
-- Media files live under the app userData media directory; this table stores metadata only.

CREATE TABLE IF NOT EXISTS display_media_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  display_id TEXT REFERENCES displays (id) ON DELETE SET NULL,
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  container TEXT NOT NULL,
  codec_four_cc TEXT NOT NULL,
  codec_label TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  frame_rate REAL,
  duration_seconds REAL,
  has_alpha INTEGER NOT NULL DEFAULT 1,
  loop_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_display_media_assets_project
  ON display_media_assets (project_id);

CREATE INDEX IF NOT EXISTS idx_display_media_assets_display
  ON display_media_assets (display_id);
