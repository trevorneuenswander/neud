CREATE TABLE IF NOT EXISTS import_history (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_project_id TEXT,
  local_project_id TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  import_version INTEGER NOT NULL,
  source_updated_at TEXT,
  result TEXT NOT NULL,
  imported_as_copy INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_import_history_source_project
  ON import_history (source_project_id);

CREATE INDEX IF NOT EXISTS idx_import_history_local_project
  ON import_history (local_project_id);
