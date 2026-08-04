-- ============================================================
-- Rename the AP department's tables to the ap_food_ prefix
-- Keeps the schema aligned with the "AP Food" department rename
-- (see 2026-08-04_rename_ap_to_ap_food.sql) so a future, separate
-- AP-something-else department doesn't collide with these names.
-- RENAME TABLE preserves data, indexes, and auto-increment state.
-- Not idempotent (MySQL has no RENAME TABLE IF EXISTS) — run once.
-- ============================================================

RENAME TABLE ap_documentos TO ap_food_documentos;
RENAME TABLE ap_schedules TO ap_food_schedules;
RENAME TABLE ap_schedule_documentos TO ap_food_schedule_documentos;
RENAME TABLE ap_requests TO ap_food_requests;
RENAME TABLE ap_entities TO ap_food_entities;
RENAME TABLE ap_prepaid_schedules TO ap_food_prepaid_schedules;
