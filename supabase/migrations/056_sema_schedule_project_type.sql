-- =============================================================================
-- NEUD v0.3.0: add sema-schedule project type for SEMA cloud projects
-- =============================================================================
-- Additive enum extension only. Do not use the new value in this migration;
-- PostgreSQL requires a commit before newly added enum labels can be referenced.

alter type public.project_type add value if not exists 'sema-schedule';
