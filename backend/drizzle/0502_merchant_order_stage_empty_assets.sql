-- Merchant app order stage empty-state images (Preparing, Ready, Picked Up, Completed, RTO, Scheduled).
-- Upload via Control → Super Admin → App images → Merchant → Orders section.
INSERT INTO public.app_static_assets (id, app, section, label, description, r2_key, proxy_url, sort_order)
VALUES
  (
    'merchant.orders.empty_preparing',
    'merchant',
    'Orders',
    'Preparing empty',
    'Orders tab — Preparing stage empty illustration.',
    NULL,
    NULL,
    30
  ),
  (
    'merchant.orders.empty_ready',
    'merchant',
    'Orders',
    'Ready empty',
    'Orders tab — Ready stage empty illustration.',
    NULL,
    NULL,
    40
  ),
  (
    'merchant.orders.empty_picked_up',
    'merchant',
    'Orders',
    'Picked up empty',
    'Orders tab — Picked Up stage empty illustration.',
    NULL,
    NULL,
    50
  ),
  (
    'merchant.orders.empty_completed',
    'merchant',
    'Orders',
    'Completed empty',
    'Orders tab — Completed stage empty illustration.',
    NULL,
    NULL,
    60
  ),
  (
    'merchant.orders.empty_rto',
    'merchant',
    'Orders',
    'RTO empty',
    'Orders tab — RTO stage empty illustration.',
    NULL,
    NULL,
    70
  ),
  (
    'merchant.orders.empty_scheduled',
    'merchant',
    'Orders',
    'Scheduled empty',
    'Orders tab — Scheduled stage empty illustration.',
    NULL,
    NULL,
    80
  )
ON CONFLICT (id) DO UPDATE SET
  section = EXCLUDED.section,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;
