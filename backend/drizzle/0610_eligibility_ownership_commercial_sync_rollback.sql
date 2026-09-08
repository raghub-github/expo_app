-- Rollback 0610: restore both ownership types on commercial_required rules
-- (previous confusing seed shape). Prefer fixing product intent in the dashboard
-- instead of rolling back unless you need the old dual-gate display.

BEGIN;

UPDATE rider_service_eligibility_rules
SET
  allowed_ownership = ARRAY['commercial', 'non_commercial']::text[],
  updated_at = NOW()
WHERE deleted_at IS NULL
  AND commercial_required = TRUE
  AND allowed_ownership = ARRAY['commercial']::text[];

COMMIT;
