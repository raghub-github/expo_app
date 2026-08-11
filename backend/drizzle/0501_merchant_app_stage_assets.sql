-- Merchant app stage images — super-admin upload slots (partner home, dashboard empty states, welcome carousel).
-- Upload via Control → Super Admin → App images → Merchant tab.
INSERT INTO public.app_static_assets (id, app, section, label, description, r2_key, proxy_url, sort_order)
VALUES
  (
    'merchant.partner.manage_stores',
    'merchant',
    'Auth',
    'Manage stores art',
    'Partner home — manage stores illustration; partnersite store settings empty state.',
    NULL,
    NULL,
    40
  ),
  (
    'merchant.orders.empty_new',
    'merchant',
    'Orders',
    'New orders empty',
    'Dashboard — New tab waiting for orders illustration.',
    NULL,
    NULL,
    10
  ),
  (
    'merchant.orders.empty_active',
    'merchant',
    'Orders',
    'Active orders empty',
    'Dashboard — Active tab no orders illustration.',
    NULL,
    NULL,
    20
  ),
  (
    'merchant.offers.empty_running',
    'merchant',
    'Offers',
    'No running offers',
    'Offers track — empty running offers illustration.',
    NULL,
    NULL,
    20
  ),
  (
    'merchant.auth.welcome_slide_2',
    'merchant',
    'Auth',
    'Welcome carousel 2',
    'Welcome onboarding background slide 2.',
    NULL,
    NULL,
    21
  ),
  (
    'merchant.auth.welcome_slide_3',
    'merchant',
    'Auth',
    'Welcome carousel 3',
    'Welcome onboarding background slide 3.',
    NULL,
    NULL,
    22
  ),
  (
    'merchant.auth.welcome_slide_4',
    'merchant',
    'Auth',
    'Welcome carousel 4',
    'Welcome onboarding background slide 4.',
    NULL,
    NULL,
    23
  ),
  (
    'merchant.auth.welcome_slide_5',
    'merchant',
    'Auth',
    'Welcome carousel 5',
    'Welcome onboarding background slide 5.',
    NULL,
    NULL,
    24
  ),
  (
    'merchant.auth.welcome_slide_6',
    'merchant',
    'Auth',
    'Welcome carousel 6',
    'Welcome onboarding background slide 6.',
    NULL,
    NULL,
    25
  )
ON CONFLICT (id) DO UPDATE SET
  section = EXCLUDED.section,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;
