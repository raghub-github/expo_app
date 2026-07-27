-- Mask full Aadhaar numbers already stored in merchant_store_documents.
-- Canonical form: XXXX-XXXX-1234 (last 4 digits only).

UPDATE public.merchant_store_documents
SET
  aadhaar_document_number =
    'XXXX-XXXX-' || RIGHT(regexp_replace(aadhaar_document_number, '\D', '', 'g'), 4),
  updated_at = NOW()
WHERE aadhaar_document_number IS NOT NULL
  AND btrim(aadhaar_document_number) <> ''
  AND length(regexp_replace(aadhaar_document_number, '\D', '', 'g')) = 12
  AND aadhaar_document_number !~* 'X';

-- Mask plain 12-digit Aadhaar values stored in registration progress form_data.step4 JSON.
UPDATE public.merchant_store_registration_progress
SET
  form_data = jsonb_set(
    form_data,
    '{step4,aadhar_number}',
    to_jsonb(
      ('XXXX-XXXX-' || RIGHT(regexp_replace(form_data #>> '{step4,aadhar_number}', '\D', '', 'g'), 4))
    ),
    true
  ),
  updated_at = NOW()
WHERE form_data ? 'step4'
  AND coalesce(form_data #>> '{step4,aadhar_number}', '') <> ''
  AND length(regexp_replace(form_data #>> '{step4,aadhar_number}', '\D', '', 'g')) = 12
  AND (form_data #>> '{step4,aadhar_number}') !~* 'X';
