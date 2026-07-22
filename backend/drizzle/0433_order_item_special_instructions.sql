-- ─────────────────────────────────────────────────────────────────────────────
-- 0433 · Item-level cooking / special instructions on order line items
--
-- Stores per-line customer cooking requests (e.g. "Less spicy", "No onion") on
-- orders_core_items. Nullable for backward compatibility with existing orders.
-- Display-only free text — no index required.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE orders_core_items
  ADD COLUMN IF NOT EXISTS special_instructions TEXT;

COMMENT ON COLUMN orders_core_items.special_instructions IS
  'Per-line customer cooking/special instructions (max 100 chars). Merchant/kitchen only — not exposed to delivery partners.';
