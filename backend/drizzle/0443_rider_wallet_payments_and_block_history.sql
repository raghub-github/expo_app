-- Rider negative-wallet recovery: full payment audit + service block/unblock history.
-- Migration: 0443_rider_wallet_payments_and_block_history
--
-- rider_wallet_payments  — one immutable row per payment ATTEMPT (any status,
--   never deleted). Covers negative-wallet recovery today; `purpose` allows reuse.
-- rider_service_block_history — one immutable row per block/unblock transition,
--   with the reason, so we can explain exactly why a service was (un)blocked.
--
-- status / reason are plain text (not enums) on purpose: the spec requires storing
-- ANY current or future gateway status without a schema change.

CREATE TABLE IF NOT EXISTS public.rider_wallet_payments (
  id                   BIGSERIAL PRIMARY KEY,
  rider_id             INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  purpose              TEXT NOT NULL DEFAULT 'negative_wallet_recovery',
  amount_paise         INTEGER NOT NULL,
  wallet_before        NUMERIC(10, 2),
  wallet_after         NUMERIC(10, 2),
  razorpay_order_id    TEXT,
  razorpay_payment_id  TEXT,
  razorpay_signature   TEXT,
  gateway              TEXT NOT NULL DEFAULT 'razorpay',
  method               TEXT,
  -- initiated|pending|authorized|captured|success|failed|cancelled|
  -- verification_failed|refunded|partially_refunded|expired|...
  status               TEXT NOT NULL DEFAULT 'initiated',
  remarks              TEXT,
  refund_id            TEXT,
  refund_amount_paise  INTEGER,
  refund_status        TEXT,
  metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by           TEXT,
  updated_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: at most one row per captured Razorpay payment id.
CREATE UNIQUE INDEX IF NOT EXISTS rider_wallet_payments_rzp_payment_id_uidx
  ON public.rider_wallet_payments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS rider_wallet_payments_rider_created_idx
  ON public.rider_wallet_payments (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rider_wallet_payments_status_idx
  ON public.rider_wallet_payments (status);
CREATE INDEX IF NOT EXISTS rider_wallet_payments_order_id_idx
  ON public.rider_wallet_payments (razorpay_order_id);

COMMENT ON TABLE public.rider_wallet_payments IS
  'Immutable audit of every rider wallet payment attempt (all statuses). Never deleted.';
COMMENT ON COLUMN public.rider_wallet_payments.wallet_before IS 'Wallet total_balance before this payment.';
COMMENT ON COLUMN public.rider_wallet_payments.wallet_after IS 'Wallet total_balance after successful credit (never > 0 for recovery).';


CREATE TABLE IF NOT EXISTS public.rider_service_block_history (
  id               BIGSERIAL PRIMARY KEY,
  rider_id         INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  service_type     TEXT NOT NULL,               -- food|parcel|person_ride|all
  action           TEXT NOT NULL,               -- blocked|unblocked
  previous_status  TEXT,
  new_status       TEXT,
  reason           TEXT NOT NULL,               -- penalty|negative_wallet|global_emergency|fraud|manual|...
  payment_ref      TEXT,                         -- razorpay_payment_id when unblock followed a payment
  wallet_before    NUMERIC(10, 2),
  wallet_after     NUMERIC(10, 2),
  performed_by     TEXT NOT NULL DEFAULT 'system',
  remarks          TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_service_block_history_rider_created_idx
  ON public.rider_service_block_history (rider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rider_service_block_history_action_idx
  ON public.rider_service_block_history (service_type, action);

COMMENT ON TABLE public.rider_service_block_history IS
  'Immutable log of rider service block/unblock transitions with reason. Never deleted.';
