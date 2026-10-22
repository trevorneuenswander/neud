-- Project package installs: machine-local downloadable project definition versions.
-- Operational data (credentials, controller state, outputs) remains outside packages.

CREATE TABLE IF NOT EXISTS project_package_installs (
  project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  project_slug TEXT NOT NULL,
  project_type TEXT NOT NULL,
  installed_version INTEGER NOT NULL,
  previous_version INTEGER,
  available_version INTEGER,
  install_state TEXT NOT NULL DEFAULT 'installed',
  package_root TEXT NOT NULL,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  manifest_hash TEXT,
  last_error TEXT,
  installed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_package_installs_slug
  ON project_package_installs (project_slug);

CREATE INDEX IF NOT EXISTS idx_project_package_installs_state
  ON project_package_installs (install_state);

-- Cloud project directory cache (accessible projects, not necessarily downloaded).
CREATE TABLE IF NOT EXISTS project_package_directory (
  cloud_project_id TEXT PRIMARY KEY,
  local_project_id TEXT REFERENCES projects (id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  project_type TEXT NOT NULL,
  available_version INTEGER NOT NULL DEFAULT 1,
  minimum_neud_version TEXT,
  description TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_package_directory_slug
  ON project_package_directory (slug);

CREATE INDEX IF NOT EXISTS idx_project_package_directory_local
  ON project_package_directory (local_project_id);
