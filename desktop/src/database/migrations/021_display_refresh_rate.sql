ALTER TABLE displays ADD COLUMN refresh_rate_ms INTEGER NOT NULL DEFAULT 5000;

UPDATE displays
SET refresh_rate_ms = 5000
WHERE refresh_rate_ms IS NULL OR refresh_rate_ms <= 0;
