DELETE FROM public.app_static_assets
WHERE id IN (
  'customer.brand.app_icon',
  'rider.brand.app_icon',
  'merchant.brand.app_icon'
);
