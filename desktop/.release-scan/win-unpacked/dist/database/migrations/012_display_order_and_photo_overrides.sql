-- Display ordering and Local Controller photo overrides

ALTER TABLE displays ADD COLUMN sort_order REAL;

UPDATE displays
SET sort_order = (
  SELECT COUNT(*)
  FROM displays AS earlier
  WHERE earlier.project_id = displays.project_id
    AND earlier.created_at <= displays.created_at
);

ALTER TABLE bag_live_state ADD COLUMN lot_photo_overrides_json TEXT NOT NULL DEFAULT '{}';
