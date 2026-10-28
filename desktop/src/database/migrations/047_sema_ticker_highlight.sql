-- SEMA Schedule Ticker Highlight overlay.
-- Replaces the on-air LATER slot without mutating sheet cache or manual Later fields.
-- Survives package updates (lives in sema_schedule_state with other controller state).

ALTER TABLE sema_schedule_state ADD COLUMN highlight_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sema_schedule_state ADD COLUMN highlight_source TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN highlight_label TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN highlight_title TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN highlight_description TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN highlight_source_row_id TEXT;
