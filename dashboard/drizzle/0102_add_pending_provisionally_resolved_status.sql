-- Add PENDING and PROVISIONALLY_RESOLVED to unified_ticket_status so "Send and set as Pending" / "Provisionally Resolved" store the exact status.
-- Run once (e.g. Supabase SQL Editor or psql). On PostgreSQL 15+ IF NOT EXISTS avoids error if run twice.

ALTER TYPE public.unified_ticket_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE public.unified_ticket_status ADD VALUE IF NOT EXISTS 'PROVISIONALLY_RESOLVED';
