-- Machine-local output routes. Physical devices are not cloud-synced.
CREATE TABLE IF NOT EXISTS output_routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_id TEXT NOT NULL,
  display_id TEXT NOT NULL,
  adapter_type TEXT NOT NULL,
  device_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  configuration_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_output_routes_project ON output_routes (project_id);
CREATE INDEX IF NOT EXISTS idx_output_routes_display ON output_routes (display_id);
