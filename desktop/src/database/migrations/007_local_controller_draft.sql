ALTER TABLE bag_live_state ADD COLUMN latest_scraped_current_lot_json TEXT;
ALTER TABLE bag_live_state ADD COLUMN local_controller_draft_json TEXT;
ALTER TABLE bag_live_state ADD COLUMN local_controller_submitted_json TEXT;
