-- Rollback 0619: Postgres cannot easily DROP a single enum value safely.
-- No-op rollback — leave 'onboarding_work_location' in document_type if already added.
SELECT 1;
