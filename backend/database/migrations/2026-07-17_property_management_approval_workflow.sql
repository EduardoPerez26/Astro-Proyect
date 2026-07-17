SET NAMES utf8mb4;

-- Adds a lightweight submit/review/approve workflow to Property Management
-- schedules so a preparer and an approver are never the same click.
ALTER TABLE property_management_schedules
    ADD COLUMN submitted_by INT NULL AFTER estado,
    ADD COLUMN submitted_at TIMESTAMP NULL AFTER submitted_by,
    ADD COLUMN reviewed_by INT NULL AFTER submitted_at,
    ADD COLUMN reviewed_at TIMESTAMP NULL AFTER reviewed_by,
    ADD COLUMN review_notes VARCHAR(1000) NULL AFTER reviewed_at;
