-- Rollback 0455: Unique rider onboarding documents
DROP INDEX IF EXISTS public.rider_documents_doc_type_number_uidx;
DROP INDEX IF EXISTS public.riders_pan_number_uidx;
DROP INDEX IF EXISTS public.riders_aadhaar_number_uidx;
