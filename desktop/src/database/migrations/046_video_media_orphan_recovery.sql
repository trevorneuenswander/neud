-- Prevent orphan recovery from recreating intentionally deleted video displays.
ALTER TABLE display_media_assets
  ADD COLUMN orphan_recovery_suppressed INTEGER NOT NULL DEFAULT 0;
