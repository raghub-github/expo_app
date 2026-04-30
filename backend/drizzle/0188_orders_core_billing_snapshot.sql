-- Persist full billing engine output on finalized orders (audit / support), mirroring pending_orders.
ALTER TABLE orders_core
  ADD COLUMN IF NOT EXISTS billing_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS billing_ruleset_version integer;

COMMENT ON COLUMN orders_core.billing_snapshot IS 'JSON snapshot from billing engine at checkout (same shape as pending_orders.billing_snapshot)';
COMMENT ON COLUMN orders_core.billing_ruleset_version IS 'billing_pricing_rules ruleset version used when snapshot was produced';
