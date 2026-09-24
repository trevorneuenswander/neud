-- Per-user pinned display viewer preferences (local-first, cloud-synced)
CREATE TABLE IF NOT EXISTS user_pinned_viewer_preferences (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  pinned_display_ids TEXT NOT NULL DEFAULT '[]',
  viewer_height_px INTEGER NOT NULL DEFAULT 220,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  cloud_sync_status TEXT NOT NULL DEFAULT 'pending',
  cloud_updated_at TEXT,
  PRIMARY KEY (user_id, project_id),
  FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_pinned_viewer_preferences_project
  ON user_pinned_viewer_preferences (project_id, user_id);
