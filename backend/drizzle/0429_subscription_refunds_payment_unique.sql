-- ─────────────────────────────────────────────────────────────────────────────
-- 0429 · One refund per payment: UNIQUE(payment_id) on merchant_subscription_refunds
--
-- The refund audit insert uses `ON CONFLICT (payment_id) DO NOTHING`, but the
-- table only had a PRIMARY KEY on `id` — no unique/exclusion constraint on
-- payment_id. That makes the ON CONFLICT clause throw 42P10 ("no unique or
-- exclusion constraint matching the ON CONFLICT specification") on EVERY refund.
-- It was swallowed by a try/catch, so the refund still completed but NO audit
-- row was ever written (breaking the refund history / audit trail, e.g. payment
-- #14 had a successful Razorpay refund yet zero audit rows).
--
-- A payment can be refunded at most once (full refund + eager revoke), so
-- payment_id is naturally unique. Dedupe any accidental dups first (keep the
-- most-complete: COMPLETED over PENDING, then latest), then add the constraint.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Defensive dedupe (there should be none today).
DELETE FROM merchant_subscription_refunds a
USING merchant_subscription_refunds b
WHERE a.payment_id = b.payment_id
  AND a.id <> b.id
  AND (
    -- b is "better": completed beats pending, then newer id wins
    (CASE WHEN b.status = 'COMPLETED' THEN 1 ELSE 0 END,  b.id)
    >
    (CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END,  a.id)
  );

-- 2) Enforce one refund per payment so ON CONFLICT (payment_id) works.
ALTER TABLE merchant_subscription_refunds
  ADD CONSTRAINT merchant_subscription_refunds_payment_id_uq UNIQUE (payment_id);
