ALTER TABLE project_code_revisions ADD COLUMN version_number INTEGER;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY resource_id
      ORDER BY created_at ASC, id ASC
    ) AS next_version
  FROM project_code_revisions
  WHERE resource_type = 'display'
)
UPDATE project_code_revisions
SET version_number = (
  SELECT next_version FROM numbered WHERE numbered.id = project_code_revisions.id
)
WHERE resource_type = 'display';

CREATE UNIQUE INDEX IF NOT EXISTS idx_display_revision_version_number
  ON project_code_revisions (resource_id, version_number)
  WHERE resource_type = 'display' AND version_number IS NOT NULL;
