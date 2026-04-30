-- =============================================================================
-- Audit: all database objects whose name contains "order" (case-insensitive)
-- Run: psql "$DATABASE_URL" -f scripts/audit-order-tables.sql
-- Or paste into Supabase SQL editor.
-- =============================================================================

-- 1) Tables + rough row counts (PostgreSQL)
SELECT
  c.relname AS table_name,
  c.reltuples::bigint AS estimated_rows,
  pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.relname ILIKE '%order%'
ORDER BY c.relname;

-- 2) Columns for each matching table (shape overview)
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name ILIKE '%order%'
ORDER BY table_name, ordinal_position;

-- 3) Foreign keys where either side mentions "order"
SELECT
  tc.table_name AS from_table,
  kcu.column_name AS from_column,
  ccu.table_name AS to_table,
  ccu.column_name AS to_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (
    tc.table_name ILIKE '%order%'
    OR ccu.table_name ILIKE '%order%'
  )
ORDER BY tc.table_name, kcu.column_name;

-- 4) Triggers on order-related tables
SELECT
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  string_agg(event_manipulation, ', ') AS events
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table ILIKE '%order%'
GROUP BY event_object_table, trigger_name, action_timing
ORDER BY event_object_table, trigger_name;

-- 5) Views (name only)
SELECT table_name AS view_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name ILIKE '%order%'
ORDER BY table_name;
