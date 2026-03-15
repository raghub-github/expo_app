-- ============================================================================
-- Seed: 3 dummy order_timelines rows for demo (first order in orders_core).
-- Migration: 0117_seed_order_timelines_dummy
-- ============================================================================

INSERT INTO order_timelines (order_id, status, previous_status, actor_type, actor_name, occurred_at)
SELECT
  id,
  'Accepted',
  'Created',
  'agent',
  'demo@example.com',
  created_at + INTERVAL '15 minutes'
FROM orders_core
ORDER BY id ASC
LIMIT 1;

INSERT INTO order_timelines (order_id, status, previous_status, actor_type, actor_name, occurred_at)
SELECT
  id,
  'Dispatch Ready',
  'Accepted',
  'agent',
  'demo@example.com',
  created_at + INTERVAL '35 minutes'
FROM orders_core
ORDER BY id ASC
LIMIT 1;

INSERT INTO order_timelines (order_id, status, previous_status, actor_type, actor_name, occurred_at)
SELECT
  id,
  'Dispatched',
  'Dispatch Ready',
  'agent',
  'demo@example.com',
  created_at + INTERVAL '40 minutes'
FROM orders_core
ORDER BY id ASC
LIMIT 1;
