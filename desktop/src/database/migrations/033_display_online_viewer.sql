ALTER TABLE project_display_code ADD COLUMN online_viewer_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE project_display_code ADD COLUMN online_visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE project_display_code ADD COLUMN online_published_at TEXT;
ALTER TABLE project_display_code ADD COLUMN online_published_revision_id TEXT;
ALTER TABLE project_display_code ADD COLUMN online_publish_error TEXT;
