-- Add project visibility flag (active/inactive) separate from operational status.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_projects_is_active ON public.projects (is_active);
