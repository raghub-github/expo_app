-- Ticket message attachments: store Supabase Storage keys (not signed URLs) so URLs can be
-- regenerated when expired. Each element in attachments[] is a JSON string:
-- {"storageKey":"tickets/<ticketId>/<uuid>-<filename>","name":"<filename>","mimeType":"<mime>"}
-- Signed URLs are generated on-demand via API and auto-renew when expired.
--
-- Required: Create a Supabase Storage bucket named "ticket-attachments" (private) in your
-- Supabase project (Dashboard → Storage → New bucket). Ensure SUPABASE_SERVICE_ROLE_KEY
-- is set in the app so uploads and signed URL generation work.

COMMENT ON COLUMN public.unified_ticket_messages.attachments IS 'Array of JSON strings: each has storageKey (path in Supabase Storage bucket ticket-attachments), name, mimeType. Signed URLs generated via API.';
