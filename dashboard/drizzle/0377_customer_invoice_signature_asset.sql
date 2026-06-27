-- Tax invoice authorised signatory — manageable from Super Admin → App images (Customer → Orders).

INSERT INTO public.app_static_assets (id, app, section, label, description, r2_key, proxy_url, sort_order)
VALUES (
  'customer.orders.invoice_signature',
  'customer',
  'Orders',
  'Invoice authorised signature',
  'Authorised signatory on food order tax invoices (HTML + PDF)',
  'app-static-assets/customer/customer_orders_invoice_signature/bundled.png',
  '/api/attachments/proxy?key=app-static-assets%2Fcustomer%2Fcustomer_orders_invoice_signature%2Fbundled.png',
  50
)
ON CONFLICT (id) DO UPDATE SET
  section = EXCLUDED.section,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  r2_key = COALESCE(app_static_assets.r2_key, EXCLUDED.r2_key),
  proxy_url = COALESCE(app_static_assets.proxy_url, EXCLUDED.proxy_url),
  updated_at = now();
