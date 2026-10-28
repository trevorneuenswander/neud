-- Separate Data Source viewing worksheet from the live on-air schedule worksheet.
-- Additive only: existing live sheet_* / rows_* remain authoritative for graphics.
-- Viewing columns are backfilled from live so current operators keep their tab.

ALTER TABLE sema_schedule_state ADD COLUMN viewing_worksheet_gid TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN viewing_worksheet_title TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN viewing_rows_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE sema_schedule_state ADD COLUMN viewing_content_hash TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN viewing_current_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sema_schedule_state ADD COLUMN viewing_current_row_id TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN viewing_last_success_at TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN viewing_last_error TEXT;

-- Worksheet identity for scheduled Highlight auto-removal (avoid cross-tab row-id collisions).
ALTER TABLE sema_schedule_state ADD COLUMN highlight_source_worksheet_gid TEXT;

UPDATE sema_schedule_state
SET
  viewing_worksheet_gid = sheet_worksheet_gid,
  viewing_worksheet_title = sheet_worksheet_title,
  viewing_rows_json = rows_json,
  viewing_content_hash = content_hash,
  viewing_current_index = current_index,
  viewing_current_row_id = current_row_id,
  viewing_last_success_at = last_success_at,
  viewing_last_error = last_error
WHERE viewing_worksheet_gid IS NULL;
