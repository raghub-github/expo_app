-- Merchant help intake on ticket_titles + ticket_priorities (enterprise ticket_priorities table).
-- ticket_titles.service_type uses enum ticket_service_type (food, parcel, …).
-- ticket_groups.service_type may be ticket_service_type OR merchant service_type (FOOD, PARCEL, RIDE) — handled below.
-- Run against dashboard DB (same as other ticket_* migrations).

CREATE TABLE IF NOT EXISTS public.ticket_priorities (
  id bigserial PRIMARY KEY,
  priority_code text NOT NULL UNIQUE,
  priority_name text NOT NULL,
  priority_description text,
  priority_level integer NOT NULL UNIQUE,
  display_color text,
  display_icon text,
  display_order integer DEFAULT 0,
  default_sla_minutes integer,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_priorities_priority_code_idx
  ON public.ticket_priorities (priority_code);

CREATE INDEX IF NOT EXISTS ticket_priorities_priority_level_idx
  ON public.ticket_priorities (priority_level);

INSERT INTO public.ticket_priorities (
  priority_code, priority_name, priority_level, display_color, display_order, default_sla_minutes, is_active
) VALUES
  ('low', 'Low', 1, '#64748b', 10, 30, true),
  ('medium', 'Medium', 2, '#2563eb', 20, 25, true),
  ('high', 'High', 3, '#ea580c', 30, 20, true),
  ('urgent', 'Urgent', 4, '#dc2626', 40, 15, true),
  ('critical', 'Critical', 5, '#7f1d1d', 50, 10, true)
ON CONFLICT (priority_code) DO UPDATE SET
  priority_name = EXCLUDED.priority_name,
  display_order = EXCLUDED.display_order,
  display_color = EXCLUDED.display_color,
  default_sla_minutes = EXCLUDED.default_sla_minutes,
  updated_at = NOW();

ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS subtext text;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS default_quick_options text[];
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS tag_id bigint REFERENCES public.ticket_tags (id) ON DELETE SET NULL;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS merchant_section_id text;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_ticket_type text;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_title text;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_category text;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_priority text;
ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS intake_unified_service_type text;

ALTER TABLE public.ticket_titles ADD COLUMN IF NOT EXISTS priority_id bigint;

ALTER TABLE public.ticket_titles DROP CONSTRAINT IF EXISTS ticket_titles_priority_id_fkey;

ALTER TABLE public.ticket_titles
  ADD CONSTRAINT ticket_titles_priority_id_fkey
  FOREIGN KEY (priority_id) REFERENCES public.ticket_priorities (id) ON DELETE SET NULL;

COMMENT ON TABLE public.ticket_priorities IS 'Configurable ticket priorities (super-admin CRUD); links to ticket_titles.priority_id.';
COMMENT ON COLUMN public.ticket_titles.subtext IS 'Help UI subtitle (e.g. merchant Contact Us).';
COMMENT ON COLUMN public.ticket_titles.default_quick_options IS 'Suggested quick-reply strings for chat intake.';
COMMENT ON COLUMN public.ticket_titles.merchant_section_id IS 'Merchant app help section key (e.g. outlet_status).';
COMMENT ON COLUMN public.ticket_titles.intake_unified_title IS 'Maps to unified_tickets.ticket_title enum when creating from merchant help.';
COMMENT ON COLUMN public.ticket_titles.intake_unified_category IS 'Maps to unified_tickets.ticket_category.';
COMMENT ON COLUMN public.ticket_titles.intake_unified_priority IS 'Maps to unified_tickets.priority (LOW|MEDIUM|HIGH|URGENT|CRITICAL).';
COMMENT ON COLUMN public.ticket_titles.intake_unified_service_type IS 'Maps to unified_tickets.service_type (FOOD|GENERAL|...).';

-- Merchant routing groups: branch on udt of ticket_groups.service_type.
DO $$
DECLARE
  tg_udt text;
BEGIN
  SELECT c.udt_name::text INTO tg_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'ticket_groups' AND c.column_name = 'service_type';

  IF tg_udt IS NULL THEN
    RETURN;
  END IF;

  IF tg_udt = 'service_type' THEN
    INSERT INTO public.ticket_groups (
      group_code, group_name, group_description, parent_group_id, group_level,
      display_order, service_type, ticket_section, ticket_category, source_role, is_active
    )
    VALUES
      (
        'GRP_MERCHANT_ORDER',
        'Merchant - Order issues',
        'Order-related merchant tickets',
        NULL,
        1,
        50,
        'FOOD'::service_type,
        'merchant'::ticket_section,
        'order_related'::ticket_category,
        'merchant'::ticket_source_role,
        true
      ),
      (
        'GRP_MERCHANT_NON',
        'Merchant - Payouts & app',
        'Merchant payouts, app, and general help',
        NULL,
        1,
        60,
        'FOOD'::service_type,
        'merchant'::ticket_section,
        'non_order'::ticket_category,
        'merchant'::ticket_source_role,
        true
      )
    ON CONFLICT (group_code) DO UPDATE SET
      group_name = EXCLUDED.group_name,
      group_description = EXCLUDED.group_description,
      ticket_section = EXCLUDED.ticket_section,
      ticket_category = EXCLUDED.ticket_category,
      source_role = EXCLUDED.source_role,
      is_active = true,
      updated_at = NOW();
  ELSIF tg_udt = 'ticket_service_type' THEN
    INSERT INTO public.ticket_groups (
      group_code, group_name, group_description, parent_group_id, group_level,
      display_order, service_type, ticket_section, ticket_category, source_role, is_active
    )
    VALUES
      (
        'GRP_MERCHANT_ORDER',
        'Merchant - Order issues',
        'Order-related merchant tickets',
        NULL,
        1,
        50,
        'food'::ticket_service_type,
        'merchant'::ticket_section,
        'order_related'::ticket_category,
        'merchant'::ticket_source_role,
        true
      ),
      (
        'GRP_MERCHANT_NON',
        'Merchant - Payouts & app',
        'Merchant payouts, app, and general help',
        NULL,
        1,
        60,
        'other'::ticket_service_type,
        'merchant'::ticket_section,
        'non_order'::ticket_category,
        'merchant'::ticket_source_role,
        true
      )
    ON CONFLICT (group_code) DO UPDATE SET
      group_name = EXCLUDED.group_name,
      group_description = EXCLUDED.group_description,
      ticket_section = EXCLUDED.ticket_section,
      ticket_category = EXCLUDED.ticket_category,
      source_role = EXCLUDED.source_role,
      is_active = true,
      updated_at = NOW();
  END IF;
END $$;

-- Optional tag for merchant help intake (ignore if ticket_tags schema differs).
INSERT INTO public.ticket_tags (tag_code, tag_name, tag_description, is_active)
VALUES (
  'merchant_help',
  'Merchant help',
  'Raised from merchant app help / contact centre',
  true
)
ON CONFLICT (tag_code) DO UPDATE SET
  tag_name = EXCLUDED.tag_name,
  tag_description = EXCLUDED.tag_description,
  is_active = EXCLUDED.is_active;

-- Seed merchant help titles (GRP_MERCHANT_* from SEED_TICKETS_30_40 or equivalent).
INSERT INTO public.ticket_titles (
  group_id,
  service_type,
  ticket_section,
  source_role,
  title_code,
  title_text,
  description,
  display_order,
  is_active,
  subtext,
  default_quick_options,
  merchant_section_id,
  intake_ticket_type,
  tag_id,
  priority_id,
  intake_unified_title,
  intake_unified_category,
  intake_unified_priority,
  intake_unified_service_type
)
VALUES
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_OUTLET_STATUS',
    'Outlet online / offline status',
    'Merchant help — contact screen',
    10,
    true,
    'Current status, visibility and restrictions',
    ARRAY[
      'I want to go online',
      'I want to go offline',
      'My store status is stuck',
      'Visibility or restriction issue',
      'Other'
    ],
    'outlet_status',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'medium' LIMIT 1),
    'STORE_STATUS_ISSUE',
    'TECHNICAL',
    'MEDIUM',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_ORDER' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_ORDERS',
    'Order related issues',
    'Merchant help — contact screen',
    20,
    true,
    'Cancellations, delays and delivery concerns',
    ARRAY[
      'I am not receiving orders',
      'Order got cancelled by mistake',
      'Delivery delay issue',
      'Wrong order received',
      'Other'
    ],
    'orders',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'high' LIMIT 1),
    'MERCHANT_ORDER_NOT_RECEIVING',
    'ORDER',
    'HIGH',
    'FOOD'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_RESTAURANT',
    'Restaurant profile',
    'Merchant help — contact screen',
    30,
    true,
    'Timings, contacts, FSSAI, bank details etc.',
    ARRAY[
      'Update timings or contacts',
      'FSSAI or documents',
      'Bank account or KYC',
      'Other'
    ],
    'restaurant',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'medium' LIMIT 1),
    'MERCHANT_APP_TECHNICAL_ISSUE',
    'TECHNICAL',
    'MEDIUM',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_ADDRESS',
    'Address & location',
    'Merchant help — contact screen',
    40,
    true,
    'Outlet address, map location and coverage',
    ARRAY[
      'Update my outlet address',
      'Map location is wrong',
      'Coverage area issue',
      'Other'
    ],
    'address',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'medium' LIMIT 1),
    'STORE_STATUS_ISSUE',
    'TECHNICAL',
    'MEDIUM',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_MENU',
    'Menu & pricing',
    'Merchant help — contact screen',
    50,
    true,
    'Items, photos, prices and charges',
    ARRAY[
      'I want to update my menu',
      'Item photos or prices',
      'Availability or charges',
      'Other'
    ],
    'menu',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'medium' LIMIT 1),
    'MENU_UPDATE_ISSUE',
    'TECHNICAL',
    'MEDIUM',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_PAYMENTS',
    'Payments & payouts',
    'Merchant help — contact screen',
    60,
    true,
    'Statements, invoices and settlement issues',
    ARRAY[
      'Payout not received',
      'Wrong amount credited',
      'Settlement or invoice query',
      'Other'
    ],
    'payments',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'urgent' LIMIT 1),
    'PAYOUT_NOT_RECEIVED',
    'EARNINGS',
    'URGENT',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_TAXES',
    'Taxes & compliance',
    'Merchant help — contact screen',
    70,
    true,
    'GST, TCS, TDS and reports',
    ARRAY[
      'GST or TCS query',
      'TDS or tax reports',
      'Compliance issue',
      'Other'
    ],
    'taxes',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'medium' LIMIT 1),
    'VERIFICATION_ISSUE',
    'VERIFICATION',
    'MEDIUM',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_ADS',
    'Promotions & visibility',
    'Merchant help — contact screen',
    80,
    true,
    'Boosts, offers and campaigns',
    ARRAY[
      'Promotions or boosts',
      'Visibility or campaigns',
      'Other'
    ],
    'ads',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'low' LIMIT 1),
    'OTHER',
    'OTHER',
    'LOW',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_BRANDING',
    'Branding & materials',
    'Merchant help — contact screen',
    90,
    true,
    'Standees, stickers and other creatives',
    ARRAY[
      'Standees or stickers',
      'Marketing materials',
      'Other'
    ],
    'branding',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'low' LIMIT 1),
    'OTHER',
    'OTHER',
    'LOW',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_REPORTS',
    'Analytics & reports',
    'Merchant help — contact screen',
    100,
    true,
    'Performance, ratings and insights',
    ARRAY[
      'Analytics or performance',
      'Ratings or insights',
      'Other'
    ],
    'reports',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'low' LIMIT 1),
    'OTHER',
    'OTHER',
    'LOW',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_HYGIENE_AUDIT',
    'Kitchen hygiene audit report',
    'Merchant help — contact screen',
    110,
    true,
    'Upload or request hygiene audit report',
    ARRAY[
      'Upload hygiene audit report',
      'Request audit report',
      'Other'
    ],
    'hygiene_audit',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'medium' LIMIT 1),
    'COMPLAINT',
    'COMPLAINT',
    'MEDIUM',
    'GENERAL'
  ),
  (
    (SELECT id FROM public.ticket_groups WHERE group_code = 'GRP_MERCHANT_NON' LIMIT 1),
    'food'::ticket_service_type,
    'merchant'::ticket_section,
    'merchant'::ticket_source_role,
    'MERCHANT_HELP_OTHER',
    'Need help with something else',
    'Merchant help — contact screen',
    120,
    true,
    'Raise a ticket and our team will assist you',
    ARRAY[
      'I need help with something else',
      'Other'
    ],
    'other',
    'non_order',
    (SELECT id FROM public.ticket_tags WHERE tag_code = 'merchant_help' LIMIT 1),
    (SELECT id FROM public.ticket_priorities WHERE priority_code = 'medium' LIMIT 1),
    'COMPLAINT',
    'COMPLAINT',
    'MEDIUM',
    'GENERAL'
  )
ON CONFLICT (title_code) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  title_text = EXCLUDED.title_text,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  is_active = EXCLUDED.is_active,
  subtext = EXCLUDED.subtext,
  default_quick_options = EXCLUDED.default_quick_options,
  merchant_section_id = EXCLUDED.merchant_section_id,
  intake_ticket_type = EXCLUDED.intake_ticket_type,
  tag_id = COALESCE(EXCLUDED.tag_id, public.ticket_titles.tag_id),
  priority_id = COALESCE(EXCLUDED.priority_id, public.ticket_titles.priority_id),
  intake_unified_title = EXCLUDED.intake_unified_title,
  intake_unified_category = EXCLUDED.intake_unified_category,
  intake_unified_priority = EXCLUDED.intake_unified_priority,
  intake_unified_service_type = EXCLUDED.intake_unified_service_type,
  updated_at = NOW();
