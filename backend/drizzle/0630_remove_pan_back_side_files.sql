-- PAN is single-sided: riders upload one card photo only (no back).
-- Drop any legacy rider_document_files rows with side='back' for pan docs.
-- I/O-safe: targeted DELETE by join; statement_timeout 15s; no table rewrite.

SET statement_timeout = '15s';

DELETE FROM public.rider_document_files f
USING public.rider_documents d
WHERE f.document_id = d.id
  AND d.doc_type::text = 'pan'
  AND f.side::text = 'back';

RESET statement_timeout;
