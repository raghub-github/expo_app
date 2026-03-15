-- Menu Setup step: one attachment type per store (images max 5, or one PDF, or one CSV).
-- R2 path (hierarchical): docs/merchants/{parent_code}/stores/{store_code}/onboarding/menu/{images|pdf|csv}/{uuid}.{ext}

CREATE TABLE IF NOT EXISTS public.merchant_menu_uploads (
  id bigserial NOT NULL,
  store_id bigint NOT NULL,
  attachment_type text NOT NULL CHECK (attachment_type IN ('images', 'pdf', 'csv')),
  file_url text,
  file_key text NOT NULL,
  file_name text,
  file_size bigint,
  mime_type text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT merchant_menu_uploads_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_menu_uploads_store_id_fkey FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.merchant_menu_uploads IS 'Onboarding menu uploads: one type per store (images up to 5, or single PDF, or single CSV).';
COMMENT ON COLUMN public.merchant_menu_uploads.attachment_type IS 'images | pdf | csv';
COMMENT ON COLUMN public.merchant_menu_uploads.file_key IS 'R2 object key, e.g. docs/merchants/GMMP1007/stores/GMMC1017/onboarding/menu/images/uuid.jpg';

CREATE INDEX IF NOT EXISTS merchant_menu_uploads_store_type_idx
  ON public.merchant_menu_uploads (store_id, attachment_type);

CREATE INDEX IF NOT EXISTS merchant_menu_uploads_active_idx
  ON public.merchant_menu_uploads (store_id, attachment_type)
  WHERE is_deleted = false;

-- Only one active row per store when attachment_type = 'pdf'
CREATE UNIQUE INDEX IF NOT EXISTS merchant_menu_uploads_one_pdf_per_store
  ON public.merchant_menu_uploads (store_id)
  WHERE attachment_type = 'pdf' AND is_deleted = false;

-- Only one active row per store when attachment_type = 'csv'
CREATE UNIQUE INDEX IF NOT EXISTS merchant_menu_uploads_one_csv_per_store
  ON public.merchant_menu_uploads (store_id)
  WHERE attachment_type = 'csv' AND is_deleted = false;

-- images: multiple rows allowed (max 5 enforced in app)
