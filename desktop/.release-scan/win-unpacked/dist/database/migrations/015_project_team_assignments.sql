-- Many-to-many project/team assignments (legacy projects.team_id retained for compatibility)

CREATE TABLE IF NOT EXISTS project_team_assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES local_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_project_team_assignments_project ON project_team_assignments (project_id);
CREATE INDEX IF NOT EXISTS idx_project_team_assignments_team ON project_team_assignments (team_id);
