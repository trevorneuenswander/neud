-- Teams and normalized access memberships (SQLite)

CREATE TABLE IF NOT EXISTS local_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  platform_role TEXT NOT NULL DEFAULT 'user' CHECK (platform_role IN ('owner', 'user')),
  is_active INTEGER NOT NULL DEFAULT 1,
  invitation_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_users_email ON local_users (email);
CREATE INDEX IF NOT EXISTS idx_local_users_platform_role ON local_users (platform_role);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT REFERENCES local_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name_unique ON teams (name);

CREATE TABLE IF NOT EXISTS team_memberships (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES local_users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator', 'viewer')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT REFERENCES local_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_user ON team_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_team ON team_memberships (team_id);

CREATE TABLE IF NOT EXISTS project_memberships (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES local_users (id) ON DELETE CASCADE,
  access_role TEXT NOT NULL CHECK (access_role IN ('operator', 'viewer')),
  created_by_user_id TEXT REFERENCES local_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_user ON project_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_project_memberships_project ON project_memberships (project_id);

CREATE TABLE IF NOT EXISTS local_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  full_name TEXT NOT NULL,
  team_id TEXT NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  team_role TEXT NOT NULL CHECK (team_role IN ('admin', 'operator', 'viewer')),
  project_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  created_by_user_id TEXT REFERENCES local_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_local_invitations_email ON local_invitations (email);

ALTER TABLE projects ADD COLUMN team_id TEXT REFERENCES teams (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects (team_id);
