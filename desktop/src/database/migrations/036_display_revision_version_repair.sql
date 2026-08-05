-- Repair display revision version_number ordinals and normalize scraper execution mode.

WITH ordered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY project_id, resource_id
      ORDER BY created_at ASC, id ASC
    ) AS canonical_version
  FROM project_code_revisions
  WHERE resource_type = 'display'
)
UPDATE project_code_revisions
SET version_number = (
  SELECT canonical_version FROM ordered WHERE ordered.id = project_code_revisions.id
)
WHERE resource_type = 'display'
  AND (
    version_number IS NULL
    OR version_number < 1
    OR version_number <> (
      SELECT canonical_version FROM ordered WHERE ordered.id = project_code_revisions.id
    )
  );

UPDATE data_sources
SET config_json = json_set(config_json, '$.execution_mode', 'local-desktop'),
    updated_at = datetime('now')
WHERE source_type = 'webpage-scraper'
  AND json_extract(config_json, '$.execution_mode') = 'remote-worker';
