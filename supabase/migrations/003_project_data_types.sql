-- =============================================================================
-- NEUD: extend project_type enum for data ingestion types
-- =============================================================================
-- Safe to apply after 002_projects_and_members.sql
-- Retains existing bag-graphics value for legacy Projects.

alter type public.project_type add value if not exists 'webpage-scraper';
alter type public.project_type add value if not exists 'json-ingest';
alter type public.project_type add value if not exists 'google-sheet-ingest';
