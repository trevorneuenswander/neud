-- Mic Tally operational state (SQ-5 MIDI monitoring).
-- Lives in local SQLite, never in the downloadable project package.

CREATE TABLE IF NOT EXISTS mic_tally_state (
  project_id TEXT PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,

  manufacturer TEXT NOT NULL DEFAULT 'Allen & Heath',
  model TEXT NOT NULL DEFAULT 'SQ-5',
  connection_type TEXT NOT NULL DEFAULT 'tcp-midi',
  mixer_host TEXT NOT NULL DEFAULT '',
  mixer_port INTEGER NOT NULL DEFAULT 51325,
  midi_channel INTEGER NOT NULL DEFAULT 1,

  simulation_enabled INTEGER NOT NULL DEFAULT 0,
  auto_connect INTEGER NOT NULL DEFAULT 0,

  slot1_input_channel INTEGER,
  slot2_input_channel INTEGER,
  slot3_input_channel INTEGER,
  slot1_label_override TEXT,
  slot2_label_override TEXT,
  slot3_label_override TEXT,

  fader_threshold_14 INTEGER NOT NULL DEFAULT 10447,
  freshness_timeout_ms INTEGER NOT NULL DEFAULT 15000,
  reconnect_enabled INTEGER NOT NULL DEFAULT 1,

  connection_status TEXT NOT NULL DEFAULT 'disconnected',
  last_message_at TEXT,
  last_sync_at TEXT,
  last_scene_at TEXT,
  last_scene_number INTEGER,
  last_error TEXT,

  channel_state_json TEXT NOT NULL DEFAULT '{}',
  diagnostics_json TEXT NOT NULL DEFAULT '[]',
  state_revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
