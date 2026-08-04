-- Postponed feature cleanup: remove unused display data mapping tables.
drop table if exists public.display_data_mapping_deletion_tombstones;
drop table if exists public.display_data_mappings;
