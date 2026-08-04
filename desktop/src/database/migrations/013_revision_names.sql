-- Optional human-readable revision names and change notes

ALTER TABLE project_code_revisions ADD COLUMN revision_name TEXT;
ALTER TABLE project_code_revisions ADD COLUMN change_note TEXT;
