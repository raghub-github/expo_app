-- ============================================================================
-- Export support: ensure unified_tickets has columns used by dashboard export
-- (tags, resolution) and a helpful index for date-bounded exports.
-- Safe on databases that already ran 0020_unified_ticket_system.sql.
-- ============================================================================

ALTER TABLE public.unified_tickets ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE public.unified_tickets ADD COLUMN IF NOT EXISTS resolution TEXT;

CREATE INDEX IF NOT EXISTS unified_tickets_export_created_at_id_idx
  ON public.unified_tickets (created_at DESC, id DESC);

COMMENT ON COLUMN public.unified_tickets.tags IS 'Ticket tags (text array); included in CSV/XLSX export when selected.';
COMMENT ON COLUMN public.unified_tickets.resolution IS 'Resolution text; mapped to Resolution notes in export when selected.';
