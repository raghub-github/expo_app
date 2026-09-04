-- Audit: record WHO created an eligibility override (the acting admin's email/name), since
-- approved_by (system_users.id) is not always resolvable from the dashboard session.
ALTER TABLE rider_eligibility_overrides
  ADD COLUMN IF NOT EXISTS created_by_label TEXT;
