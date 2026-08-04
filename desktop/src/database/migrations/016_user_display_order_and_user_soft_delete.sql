-- Per-user display ordering
CREATE TABLE IF NOT EXISTS user_display_order (
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  display_id TEXT NOT NULL,
  sort_index INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, project_id, display_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (display_id) REFERENCES displays(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_display_order_project_user
  ON user_display_order (project_id, user_id, sort_index);

-- User soft delete
ALTER TABLE local_users ADD COLUMN deleted_at TEXT;
ALTER TABLE local_users ADD COLUMN deleted_by_user_id TEXT;
