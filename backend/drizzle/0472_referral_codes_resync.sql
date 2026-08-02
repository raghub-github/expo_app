-- =============================================================================
-- 0472: Referral code re-sync (customer + rider)
-- =============================================================================
-- Safe / idempotent. Does NOT invent new codes for users who already have one.
--
-- Paired app fix (required for /v1/referral/me to stop 500-ing):
--   customers.primary_mobile  (NOT phone)
--   riders.mobile             (NOT phone)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Upsert every existing customer referral_code into referral_codes
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT c.id AS user_id, UPPER(TRIM(c.referral_code)) AS code
    FROM customers c
    WHERE c.referral_code IS NOT NULL AND TRIM(c.referral_code) <> ''
  LOOP
    BEGIN
      INSERT INTO referral_codes (user_type, user_id, referral_code, active, suspended, updated_at)
      VALUES ('customer', rec.user_id, rec.code, true, false, NOW())
      ON CONFLICT (user_type, user_id) DO UPDATE
        SET referral_code = EXCLUDED.referral_code,
            active = true,
            suspended = false,
            updated_at = NOW();
    EXCEPTION
      WHEN unique_violation THEN
        -- Code already owned by another row — leave that owner intact.
        NULL;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Upsert every existing rider referral_code into referral_codes
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT r.id::bigint AS user_id, UPPER(TRIM(r.referral_code)) AS code
    FROM riders r
    WHERE r.referral_code IS NOT NULL AND TRIM(r.referral_code) <> ''
  LOOP
    BEGIN
      INSERT INTO referral_codes (user_type, user_id, referral_code, active, suspended, updated_at)
      VALUES ('rider', rec.user_id, rec.code, true, false, NOW())
      ON CONFLICT (user_type, user_id) DO UPDATE
        SET referral_code = EXCLUDED.referral_code,
            active = true,
            suspended = false,
            updated_at = NOW();
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Copy referral_codes -> profile ONLY when profile code is empty (never overwrite)
-- -----------------------------------------------------------------------------
UPDATE customers c
SET referral_code = rc.referral_code,
    updated_at = NOW()
FROM referral_codes rc
WHERE rc.user_type = 'customer'
  AND rc.user_id = c.id
  AND rc.active = true
  AND COALESCE(rc.suspended, false) = false
  AND (c.referral_code IS NULL OR TRIM(c.referral_code) = '');

-- -----------------------------------------------------------------------------
-- 5. Repair customer rule if referrer amount was zeroed while friend amount remains
-- -----------------------------------------------------------------------------
UPDATE referral_reward_rules
SET reward_amount = referred_reward_amount,
    updated_at = NOW()
WHERE rule_code = 'CUSTOMER_FIRST_ORDER'
  AND also_credit_referred = true
  AND COALESCE(reward_amount, 0) = 0
  AND COALESCE(referred_reward_amount, 0) > 0;

SELECT public.bump_referral_config_version();
