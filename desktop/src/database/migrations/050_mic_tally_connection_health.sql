-- Mic Tally connection-health diagnostics (application-level mixer reachability).

ALTER TABLE mic_tally_state ADD COLUMN last_health_response_at TEXT;
ALTER TABLE mic_tally_state ADD COLUMN last_health_query_at TEXT;
ALTER TABLE mic_tally_state ADD COLUMN reconnect_attempt_count INTEGER NOT NULL DEFAULT 0;
