-- Add persistent pinned display stack membership (local SQLite)
ALTER TABLE user_pinned_viewer_preferences
  ADD COLUMN pinned_stacks TEXT NOT NULL DEFAULT '[]';
