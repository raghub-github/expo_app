-- Rollback 0485 — unique refund RRN backfill.
-- Does not recreate RFND-/WALLET-/GCWR- placeholders (data already upgraded).
-- Unique index on refund_reference is retained (also created by 0483).

COMMENT ON COLUMN public.order_refunds.refund_reference IS
  'Customer-facing refund reference (RRN). Prefer Razorpay rfnd_*, else WALLET-{ledger}, else RFND-{id}.';
