-- Saved delivery-partner instructions per customer address (same array shape as orders_core.delivery_instructions_list).

ALTER TABLE public.customer_addresses
  ADD COLUMN IF NOT EXISTS delivery_instructions_list jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.customer_addresses.delivery_instructions_list IS
  'Rider instructions for this saved address: short note + preference tags as JSON text array.';

-- Keep legacy TEXT column in sync for older readers.
UPDATE public.customer_addresses
SET delivery_instructions = (
  SELECT string_agg(value, ' | ')
  FROM jsonb_array_elements_text(delivery_instructions_list) AS t(value)
)
WHERE delivery_instructions_list IS NOT NULL
  AND delivery_instructions_list <> '[]'::jsonb
  AND (delivery_instructions IS NULL OR trim(delivery_instructions) = '');
