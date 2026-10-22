-- SEMA Local Controller: independent Now / Next / Later manual text slots.
-- Existing manual_title / manual_description remain the NOW title and description.
-- Sheet URL and cache columns are unchanged.

ALTER TABLE sema_schedule_state ADD COLUMN manual_next_title TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN manual_next_description TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN manual_later_title TEXT;
ALTER TABLE sema_schedule_state ADD COLUMN manual_later_description TEXT;
