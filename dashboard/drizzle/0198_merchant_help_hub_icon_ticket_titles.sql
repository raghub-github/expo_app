-- Merchant Contact Us / help hub: store Ionicons name per row so icons are DB-managed (not only app fallback map).
-- Rows are the same catalog as migration 0194 (ticket_titles.merchant_section_id, ticket_section = merchant).

ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS merchant_help_icon_name text;

COMMENT ON COLUMN public.ticket_titles.merchant_help_icon_name IS
  'Ionicons glyph key for merchant help hub (e.g. power-outline). App falls back to static map if null.';

UPDATE public.ticket_titles SET merchant_help_icon_name = 'power-outline' WHERE merchant_section_id = 'outlet_status';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'document-text-outline' WHERE merchant_section_id = 'orders';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'business-outline' WHERE merchant_section_id = 'restaurant';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'location-outline' WHERE merchant_section_id = 'address';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'fast-food-outline' WHERE merchant_section_id = 'menu';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'wallet-outline' WHERE merchant_section_id = 'payments';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'receipt-outline' WHERE merchant_section_id = 'taxes';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'megaphone-outline' WHERE merchant_section_id = 'ads';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'pricetag-outline' WHERE merchant_section_id = 'branding';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'stats-chart-outline' WHERE merchant_section_id = 'reports';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'medkit-outline' WHERE merchant_section_id = 'hygiene_audit';
UPDATE public.ticket_titles SET merchant_help_icon_name = 'chatbubbles-outline' WHERE merchant_section_id = 'other';
