ALTER TABLE data_source_status ADD COLUMN last_duration_ms INTEGER;
ALTER TABLE data_source_status ADD COLUMN last_record_count INTEGER;
ALTER TABLE data_source_status ADD COLUMN last_payload_size_bytes INTEGER;
ALTER TABLE data_source_status ADD COLUMN last_run_failed_at TEXT;
ALTER TABLE data_source_status ADD COLUMN scrapes_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE data_source_status ADD COLUMN successful_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE data_source_status ADD COLUMN failed_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE data_source_status ADD COLUMN stats_day TEXT;
