-- Fix unified_ticket_messages id sequence so INSERT gets a valid next id (avoids duplicate key on pkey).
-- Run this if you see: duplicate key value violates unique constraint "unified_ticket_messages_pkey"

SELECT setval(
  pg_get_serial_sequence('public.unified_ticket_messages', 'id'),
  COALESCE((SELECT MAX(id) FROM public.unified_ticket_messages), 1)
);
