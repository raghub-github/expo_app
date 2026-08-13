-- Merchant app onboarding: packaging tips video slot (super-admin App images → in-app player).
INSERT INTO public.app_static_assets (id, app, section, label, description, r2_key, proxy_url, sort_order)
VALUES (
  'merchant.onboarding.packaging_tips_video',
  'merchant',
  'Onboarding',
  'Packaging tips video',
  'Merchant onboarding — View packaging tips (MP4). Must play to the end to complete the task.',
  NULL,
  NULL,
  10
)
ON CONFLICT (id) DO UPDATE SET
  section = EXCLUDED.section,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order;
