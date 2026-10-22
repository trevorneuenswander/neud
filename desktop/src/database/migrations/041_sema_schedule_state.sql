-- SEMA schedule source/controller state.
-- Operational data (sheet config, last-known cache, operator position, manual backup fields).
-- Lives in the local database, never in the downloadable project package, so it survives
-- package update/remove. No credentials are stored here: v1 reads published/readable sheets
-- via public CSV export only (private Google API/OAuth is deferred and must keep secrets in
-- the OS credential store, never in this table or in a project package).

CREATE TABLE IF NOT EXISTS sema_schedule_state (
  project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,

  -- Which source drives the display: 'google-sheets' | 'manual'. Manual always wins when selected.
  source_mode TEXT NOT NULL DEFAULT 'google-sheets',

  -- Last-known Google Sheet cache + operator position inside that cache.
  rows_json TEXT NOT NULL DEFAULT '[]',
  current_index INTEGER NOT NULL DEFAULT 0,
  current_row_id TEXT,
  content_hash TEXT,

  -- Sheet configuration (public-csv only in v1).
  sheet_spreadsheet_id TEXT,
  sheet_worksheet_gid TEXT,
  sheet_worksheet_title TEXT,
  sheet_access_mode TEXT NOT NULL DEFAULT 'public-csv',
  poll_interval_ms INTEGER NOT NULL DEFAULT 15000,

  -- Fetch health. A failure never clears the cache.
  last_success_at TEXT,
  last_attempt_at TEXT,
  last_error TEXT,

  -- Manual backup fields (shown as NOW when source_mode = 'manual').
  manual_date TEXT,
  manual_time TEXT,
  manual_title TEXT,
  manual_description TEXT,

  -- selection_seq changes only on operator navigation; state_revision on any output change.
  selection_seq INTEGER NOT NULL DEFAULT 0,
  state_revision INTEGER NOT NULL DEFAULT 0,

  updated_at TEXT NOT NULL
);
