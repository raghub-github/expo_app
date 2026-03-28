-- Spam / bulk "Rejected" sets status to REJECTED; enum lacked this value and PATCH failed with invalid enum input.
ALTER TYPE public.unified_ticket_status ADD VALUE IF NOT EXISTS 'REJECTED';
