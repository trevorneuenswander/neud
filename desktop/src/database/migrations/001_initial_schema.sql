-- Local NEUD schema (SQLite)
-- Version 1

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  project_number INTEGER,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  project_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  display_token TEXT,
  theme TEXT,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  icon TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects (slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);

CREATE TABLE IF NOT EXISTS project_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  desired_state TEXT NOT NULL DEFAULT 'stopped',
  config_json TEXT NOT NULL DEFAULT '{}',
  auto_start INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_data_sources_project ON data_sources (project_id);

CREATE TABLE IF NOT EXISTS data_source_settings (
  source_id TEXT PRIMARY KEY REFERENCES data_sources (id) ON DELETE CASCADE,
  poll_interval_ms INTEGER NOT NULL DEFAULT 5000,
  details_ttl_ms INTEGER NOT NULL DEFAULT 300000,
  max_detail_checks_per_poll INTEGER NOT NULL DEFAULT 3,
  headless INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_source_sources (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES data_sources (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_key TEXT NOT NULL,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_data_source_sources_source ON data_source_sources (source_id);

CREATE TABLE IF NOT EXISTS data_source_status (
  source_id TEXT PRIMARY KEY REFERENCES data_sources (id) ON DELETE CASCADE,
  actual_state TEXT NOT NULL DEFAULT 'stopped',
  health_state TEXT NOT NULL DEFAULT 'unknown',
  worker_id TEXT,
  last_heartbeat_at TEXT,
  last_run_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_source_snapshots (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES data_sources (id) ON DELETE CASCADE,
  data_json TEXT NOT NULL,
  record_count INTEGER,
  payload_size_bytes INTEGER,
  duration_ms INTEGER,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_source_snapshots_source ON data_source_snapshots (source_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS data_source_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES data_sources (id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  event_type TEXT,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_source_logs_source ON data_source_logs (source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS displays (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_key TEXT NOT NULL,
  html_path TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, display_key)
);

CREATE TABLE IF NOT EXISTS display_settings (
  display_id TEXT PRIMARY KEY REFERENCES displays (id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS controllers (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  controller_key TEXT NOT NULL,
  html_path TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, controller_key)
);

CREATE TABLE IF NOT EXISTS controller_settings (
  controller_id TEXT PRIMARY KEY REFERENCES controllers (id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  mime_type TEXT,
  file_path TEXT NOT NULL,
  size_bytes INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, asset_key)
);

CREATE TABLE IF NOT EXISTS publishing_targets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  display_id TEXT REFERENCES displays (id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'development',
  public_slug TEXT,
  access_token_hash TEXT,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'stopped',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publishing_sessions (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES publishing_targets (id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  public_url TEXT,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL,
  entitlement_json TEXT NOT NULL DEFAULT '{}',
  issued_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  offline_expires_at TEXT NOT NULL,
  monotonic_verified_ms INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL,
  signature TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
