-- Phase B: ownership allowlist must match commercial_required semantics.
--
-- Previously seed stored allowed_ownership = [commercial, non_commercial] WHILE
-- commercial_required = true for person_ride. The dashboard showed both ownership
-- chips as "allowed" but the engine still blocked Non-commercial via the commercial
-- gate — confusing and contradictory to "if both ownerships are selected, both are accepted".
--
-- Rule going forward:
--   commercial_required = true  → allowed_ownership must be commercial-only
--   commercial_required = false → allowlist may include non_commercial (untouched here)
--
-- I/O-safe / idempotent:
--   • Single transaction (BEGIN…COMMIT).
--   • UPDATE only rows that still need rewrite (already commercial-only → skipped).
--   • No DDL, no index rebuild, no full-table rewrite of unrelated columns.
--   • commercial_required = false rows (e.g. Haryana Ride allowing non-commercial) are NEVER touched.
--   • Re-runnable: second pass updates 0 rows.

BEGIN;

-- Audit: how many rows will change (logged via NOTICE for operators).
DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*)::integer INTO n
  FROM rider_service_eligibility_rules
  WHERE deleted_at IS NULL
    AND commercial_required = TRUE
    AND (
      allowed_ownership IS NULL
      OR cardinality(allowed_ownership) = 0
      OR allowed_ownership @> ARRAY['non_commercial']::text[]
      OR allowed_ownership IS DISTINCT FROM ARRAY['commercial']::text[]
    );
  RAISE NOTICE '0610: rows to normalize (commercial_required=true, ownership not commercial-only): %', n;
END $$;

UPDATE rider_service_eligibility_rules
SET
  allowed_ownership = ARRAY['commercial']::text[],
  updated_at = NOW()
WHERE deleted_at IS NULL
  AND commercial_required = TRUE
  AND (
    allowed_ownership IS NULL
    OR cardinality(allowed_ownership) = 0
    OR allowed_ownership @> ARRAY['non_commercial']::text[]
    OR allowed_ownership IS DISTINCT FROM ARRAY['commercial']::text[]
  );

COMMIT;
