-- =============================================================================
-- 0538 — Referral codes for already-registered parent merchants
-- Depends on 0470 + 0471 + 0536 (merchant enum).
-- Idempotent. Insert-only. No merchant_parents / merchant_stores rewrite.
--
-- One code per PARENT merchant (not per child store).
-- Only parents that do not already have a referral_codes row are inserted.
--
-- I/O impact:
--   * Index lookup on referral_codes (user_type, user_id)
--   * INSERT of missing parent rows only
--   * No UPDATE of merchant_parents or merchant_stores
--   * No full-table rewrite
-- =============================================================================

-- Pass 1: deterministic MX + md5(id). Skip if the parent already has a code
-- or if that exact string is already owned by someone else.
INSERT INTO referral_codes (user_type, user_id, referral_code, active)
SELECT
  'merchant'::referral_user_type,
  mp.id,
  ('MX' || UPPER(SUBSTRING(md5('gatimitra-merchant-ref-v1-' || mp.id::text) FROM 1 FOR 8))),
  true
FROM merchant_parents mp
WHERE NOT EXISTS (
  SELECT 1
  FROM referral_codes rc
  WHERE rc.user_type = 'merchant'::referral_user_type
    AND rc.user_id = mp.id
)
  AND NOT EXISTS (
    SELECT 1
    FROM referral_codes o
    WHERE o.referral_code = ('MX' || UPPER(SUBSTRING(md5('gatimitra-merchant-ref-v1-' || mp.id::text) FROM 1 FOR 8)))
  )
ON CONFLICT (user_type, user_id) DO NOTHING;

-- Pass 2: leftovers whose v1 code collided. Insert-only.
INSERT INTO referral_codes (user_type, user_id, referral_code, active)
SELECT
  'merchant'::referral_user_type,
  mp.id,
  ('MX' || UPPER(SUBSTRING(md5('gatimitra-merchant-ref-v2-' || mp.id::text) FROM 1 FOR 8))),
  true
FROM merchant_parents mp
WHERE NOT EXISTS (
  SELECT 1
  FROM referral_codes rc
  WHERE rc.user_type = 'merchant'::referral_user_type
    AND rc.user_id = mp.id
)
  AND NOT EXISTS (
    SELECT 1
    FROM referral_codes o
    WHERE o.referral_code = ('MX' || UPPER(SUBSTRING(md5('gatimitra-merchant-ref-v2-' || mp.id::text) FROM 1 FOR 8)))
  )
ON CONFLICT (user_type, user_id) DO NOTHING;
