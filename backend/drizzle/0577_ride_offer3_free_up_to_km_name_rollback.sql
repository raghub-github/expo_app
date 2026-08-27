-- Rollback 0577: restore previous display name for offer #3.

UPDATE public.billing_platform_offers
SET
  name = '1ST RIDE FREE',
  updated_at = now()
WHERE id = 3
  AND upper(trim(service_type)) = 'RIDE';
