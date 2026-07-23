-- ─────────────────────────────────────────────────────────────────────────────
-- 0427 · Backfill GST breakdown for webhook-inserted subscription_payments
--
-- Some rows were inserted by the partner-site Razorpay webhook (fixed in code) with
-- ONLY `amount` = plan.price (the SUBTOTAL) and NO tax breakdown — subtotal_paise /
-- gst_amount_paise / total_paise / gst_percent_applied were NULL. The Razorpay charge
-- included GST (create-payment-order charges subtotal + GST), so the record must reflect
-- it: treat the stored `amount` as the subtotal, reconstruct the breakdown from the
-- plan's gst_percent, and normalize `amount` to the GST-inclusive TOTAL (consistent with
-- the complete rows, where amount = total).
--
-- Dry-run verified: only incomplete rows (total_paise IS NULL) are touched. #14
-- (amount ₹3, plan GST 18%) → subtotal 300, gst 54, total 354, amount ₹3.54.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE subscription_payments sp
SET
  gst_percent_applied = COALESCE(sp.gst_percent_applied, p.gst_percent, 0),
  subtotal_paise      = ROUND(sp.amount * 100)::int,
  gst_amount_paise    = ROUND(sp.amount * 100 * COALESCE(p.gst_percent, 0) / 100)::int,
  total_paise         = ROUND(sp.amount * 100 * (1 + COALESCE(p.gst_percent, 0) / 100))::int,
  amount              = ROUND(sp.amount * (1 + COALESCE(p.gst_percent, 0) / 100) * 100) / 100,
  updated_at          = NOW()
FROM merchant_plans p
WHERE sp.plan_id = p.id
  AND sp.total_paise IS NULL
  AND sp.amount IS NOT NULL
  AND sp.amount > 0;
