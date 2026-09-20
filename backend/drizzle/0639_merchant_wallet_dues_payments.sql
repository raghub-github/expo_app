-- Merchant outstanding-dues recovery via UPI/Razorpay (store self-serve clear).
-- I/O-safe / idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
--
-- One immutable audit row per payment attempt. Successful capture credits
-- merchant_wallet via merchant_wallet_credit (ledger description:
-- "Outstanding dues Cleared") with idempotency_key = merchant_dues_rzp_<payment_id>.

CREATE TABLE IF NOT EXISTS public.merchant_wallet_dues_payments (
  id                   BIGSERIAL PRIMARY KEY,
  merchant_store_id    BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  wallet_id            BIGINT REFERENCES public.merchant_wallet(id) ON DELETE SET NULL,
  purpose              TEXT NOT NULL DEFAULT 'outstanding_dues_clear',
  amount_paise         INTEGER NOT NULL,
  wallet_before        NUMERIC(14, 2),
  wallet_after         NUMERIC(14, 2),
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT,
  razorpay_signature   TEXT,
  gateway              TEXT NOT NULL DEFAULT 'razorpay',
  method               TEXT,
  status               TEXT NOT NULL DEFAULT 'initiated',
  remarks              TEXT,
  ledger_id            BIGINT,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by           TEXT,
  updated_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_wallet_dues_payments_rzp_payment_id_uidx
  ON public.merchant_wallet_dues_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_wallet_dues_payments_store_created_idx
  ON public.merchant_wallet_dues_payments (merchant_store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS merchant_wallet_dues_payments_order_id_idx
  ON public.merchant_wallet_dues_payments (razorpay_order_id);

CREATE INDEX IF NOT EXISTS merchant_wallet_dues_payments_status_idx
  ON public.merchant_wallet_dues_payments (status);

COMMENT ON TABLE public.merchant_wallet_dues_payments IS
  'Immutable audit of merchant outstanding-dues clear payments (Razorpay/UPI). Never deleted.';
COMMENT ON COLUMN public.merchant_wallet_dues_payments.wallet_before IS
  'merchant_wallet.available_balance before credit.';
COMMENT ON COLUMN public.merchant_wallet_dues_payments.wallet_after IS
  'merchant_wallet.available_balance after successful credit.';
