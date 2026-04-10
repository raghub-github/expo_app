# OMS Canonical Table Ownership Map

This document defines canonical ownership for the order-management, billing, and ledger domains.

## Canonical Domain Ownership

### Order Aggregate (Canonical)
- `orders_core` (business order key: `order_id`)
- `orders_core_items`
- `orders_core_item_addons`
- `pending_orders` (pre-finalization checkout lock)

### Billing Configuration (Canonical)
- `billing_pricing_rules`
- `billing_pricing_rule_conditions`
- `billing_tax_configs`
- `billing_delivery_slabs`
- `billing_packaging_slabs`
- `billing_delivery_rate_cards`
- `billing_platform_offers`
- `billing_discounts`
- `billing_ruleset_version`

### Runtime Billing Snapshot + Decomposition (New Canonical)
- `order_version_snapshots`
- `order_charge_lines`
- `order_tax_lines`
- `order_discount_lines`
- `order_bill_summary_versions`

### Payments + Refund Runtime (New Canonical)
- `payment_intents`
- `payment_transactions`
- `payment_allocations`
- `refund_intents`
- `refund_transactions`
- `refund_line_items`
- `tax_reversal_lines`

### Ledger (New Canonical)
- `ledger_accounts`
- `ledger_journals`
- `ledger_entries`
- `ledger_references`

### Rider Fulfillment (Canonical Runtime + Projection)
- `order_rider_assignment_events` (append-only)
- `order_rider_assignments_current` (single active assignment projection)
- `rider_tracking_points`

### Event Timeline (Canonical)
- `order_events` remains canonical event stream for order lifecycle changes.

## Legacy / Transitional Tables

These are still present and may remain readable for backwards compatibility while migration completes:

- `orders`
- `order_items`
- `order_item_addons`
- `order_payments`
- `order_refunds`
- `order_rider_assignments`
- `order_audit_log`

## Migration Policy

1. **No hard cutover without shadow writes**: new canonical tables must be dual-written first.
2. **Read switch by feature flag**: services should shift reads only after reconciliation succeeds.
3. **Append-only financial/event records**: no in-place overwrite for bill lines, ledger entries, refunds, or events.
4. **Backward compatibility windows**: expose compatibility views for legacy readers during transition.
