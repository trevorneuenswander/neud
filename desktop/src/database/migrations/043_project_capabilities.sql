-- Pass 21: many-to-many project capabilities (not a single project.type enum).

CREATE TABLE IF NOT EXISTS project_capabilities (
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  capability TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT,
  PRIMARY KEY (project_id, capability)
);

CREATE INDEX IF NOT EXISTS idx_project_capabilities_capability
  ON project_capabilities (capability);

-- Seed existing Broad Arrow / SEMA / ingest projects from project_type.
INSERT OR IGNORE INTO project_capabilities (project_id, capability, created_at, created_by)
SELECT id, 'webpage-scraper', datetime('now'), NULL
FROM projects WHERE project_type = 'bag-graphics';

INSERT OR IGNORE INTO project_capabilities (project_id, capability, created_at, created_by)
SELECT id, 'manual-controller', datetime('now'), NULL
FROM projects WHERE project_type = 'bag-graphics';

INSERT OR IGNORE INTO project_capabilities (project_id, capability, created_at, created_by)
SELECT id, 'data-source', datetime('now'), NULL
FROM projects WHERE project_type = 'sema-schedule';

INSERT OR IGNORE INTO project_capabilities (project_id, capability, created_at, created_by)
SELECT id, 'rundown-schedule', datetime('now'), NULL
FROM projects WHERE project_type = 'sema-schedule';

INSERT OR IGNORE INTO project_capabilities (project_id, capability, created_at, created_by)
SELECT id, 'manual-controller', datetime('now'), NULL
FROM projects WHERE project_type = 'sema-schedule';

INSERT OR IGNORE INTO project_capabilities (project_id, capability, created_at, created_by)
SELECT id, 'webpage-scraper', datetime('now'), NULL
FROM projects WHERE project_type = 'webpage-scraper';

INSERT OR IGNORE INTO project_capabilities (project_id, capability, created_at, created_by)
SELECT id, 'data-source', datetime('now'), NULL
FROM projects WHERE project_type IN ('json-ingest', 'google-sheet-ingest');

INSERT OR IGNORE INTO project_capabilities (project_id, capability, created_at, created_by)
SELECT id, 'display-only', datetime('now'), NULL
FROM projects
WHERE project_type NOT IN (
  'bag-graphics',
  'sema-schedule',
  'webpage-scraper',
  'json-ingest',
  'google-sheet-ingest'
)
AND id NOT IN (SELECT project_id FROM project_capabilities);
