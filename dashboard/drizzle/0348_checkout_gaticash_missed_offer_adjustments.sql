-- ============================================================================
-- 0348: Checkout GatiCash + missed-offer wallet adjustments on pending_orders
-- Run AFTER 0347_customer_gaticash_wallet_ops.sql
--
-- checkout_metadata keys (JSONB, no schema change required):
--   gatiCashAmount              — wallet applied toward payment (deducted from to-pay)
--   missedOfferCompensation     — { amountInr, discountInr, offerKey, offerId, offerSource, offerKind, offerTitle }
--     amountInr   = gap added to to-pay; credited to GatiCash after order finalize
--     discountInr = offer savings subtracted from to-pay when unlocked
--
-- billing_snapshot.checkoutAdjustments (application-enriched at createPending):
--   gatiCashApplied, missedOfferDiscount, missedOfferWalletAdd, lines[], missedOfferCompensation
-- ============================================================================

ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS gati_cash_applied NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (gati_cash_applied >= 0),
  ADD COLUMN IF NOT EXISTS missed_offer_discount NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (missed_offer_discount >= 0),
  ADD COLUMN IF NOT EXISTS missed_offer_wallet_add NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (missed_offer_wallet_add >= 0);

COMMENT ON COLUMN public.pending_orders.gati_cash_applied IS
  'GatiCash wallet amount applied toward this checkout payment (INR). Debited on order finalize.';

COMMENT ON COLUMN public.pending_orders.missed_offer_discount IS
  'Missed-offer discount subtracted from payable at checkout (INR). From checkout_metadata.missedOfferCompensation.discountInr.';

COMMENT ON COLUMN public.pending_orders.missed_offer_wallet_add IS
  'Missed-offer gap amount added to payable at checkout (INR). Credited to GatiCash wallet on order finalize.';

COMMENT ON TABLE public.pending_orders IS
  'Payment-first checkout sessions. grand_total includes GatiCash apply (−), missed-offer discount (−), and missed-offer wallet add (+).';
