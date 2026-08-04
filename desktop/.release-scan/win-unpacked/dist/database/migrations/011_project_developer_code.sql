CREATE TABLE IF NOT EXISTS project_scraper_code (
  project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'javascript',
  entry_filename TEXT NOT NULL DEFAULT 'scraper.js',
  draft_source TEXT,
  published_source TEXT NOT NULL DEFAULT '',
  draft_revision_id TEXT,
  published_revision_id TEXT,
  draft_saved_at TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  seeded_at TEXT
);

CREATE TABLE IF NOT EXISTS project_display_code (
  display_id TEXT PRIMARY KEY REFERENCES displays (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'built-in',
  draft_html TEXT,
  draft_css TEXT,
  draft_javascript TEXT,
  published_revision_id TEXT,
  draft_saved_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_project_display_code_project
  ON project_display_code (project_id, archived);

CREATE TABLE IF NOT EXISTS project_code_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  message TEXT,
  source_hash TEXT NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'not-validated',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_project_code_revisions_lookup
  ON project_code_revisions (project_id, resource_type, resource_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_validation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_validation_logs_lookup
  ON project_validation_logs (project_id, created_at DESC);
