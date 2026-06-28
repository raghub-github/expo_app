-- =============================================================================
-- SYNC REFERRALS FROM RIDERS.REFERRED_BY
-- This migration syncs existing referral data from riders.referred_by column
-- into the referrals table to ensure all referral relationships are tracked.
-- Idempotent: Only inserts referrals that don't already exist.
-- =============================================================================

-- Insert referrals for all riders that have referred_by set but don't have
-- a corresponding entry in the referrals table
INSERT INTO referrals (
  referrer_id,
  referred_id,
  referral_code_used,
  referred_city_name,
  created_at
)
SELECT 
  r.referred_by AS referrer_id,
  r.id AS referred_id,
  ref.referral_code AS referral_code_used,
  r.city AS referred_city_name,
  r.created_at
FROM riders r
INNER JOIN riders ref ON ref.id = r.referred_by
WHERE r.referred_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM referrals ref_table 
    WHERE ref_table.referred_id = r.id
  )
ON CONFLICT (referred_id) DO NOTHING;

-- Log the number of referrals synced
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM riders r
  WHERE r.referred_by IS NOT NULL
    AND EXISTS (
      SELECT 1 
      FROM referrals ref_table 
      WHERE ref_table.referred_id = r.id
    );
  
  RAISE NOTICE 'Migration completed. Total referrals now tracked: %', v_count;
END $$;

COMMENT ON TABLE referrals IS 'Referral tracking table. Synced from riders.referred_by column via migration 0090.';
