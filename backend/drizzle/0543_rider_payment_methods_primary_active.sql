-- Rider bank accounts: keep history (deactivate, don't delete) + primary for payouts.
ALTER TABLE public.rider_payment_methods
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- Existing non-deleted rows stay active; mark latest bank per rider as primary.
UPDATE public.rider_payment_methods rpm
SET is_active = TRUE,
    is_primary = FALSE,
    updated_at = NOW()
WHERE rpm.deleted_at IS NULL
  AND rpm.method_type = 'bank';

WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY rider_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.rider_payment_methods
  WHERE deleted_at IS NULL
    AND method_type = 'bank'
)
UPDATE public.rider_payment_methods rpm
SET is_primary = TRUE,
    is_active = TRUE,
    updated_at = NOW()
FROM ranked
WHERE rpm.id = ranked.id
  AND ranked.rn = 1;

CREATE INDEX IF NOT EXISTS rider_payment_methods_rider_active_idx
  ON public.rider_payment_methods (rider_id, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS rider_payment_methods_rider_primary_idx
  ON public.rider_payment_methods (rider_id, is_primary)
  WHERE deleted_at IS NULL AND is_primary = TRUE;
