UPDATE displays
SET settings_json = json_set(
  COALESCE(NULLIF(settings_json, ''), '{}'),
  '$.runtimeAdapterKey',
  'broad-arrow-legacy-pylon'
)
WHERE id IN (
  SELECT display_id
  FROM project_display_code
  WHERE slug = 'legacy-pylon'
);
