-- Phase 1: Child onboarding hardening (migration-safe, non-destructive)
-- Goal: align schema with upgraded onboarding UI (including menu step + resumable flow).

BEGIN;

-- 1) Strengthen onboarding progress tracking
ALTER TABLE public.merchant_store_registration_progress
  ADD COLUMN IF NOT EXISTS last_step_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS step_payloads jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS menu_upload_mode text,
  ADD COLUMN IF NOT EXISTS menu_upload_files jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_store_registration_progress_menu_upload_mode_check'
  ) THEN
    ALTER TABLE public.merchant_store_registration_progress
      ADD CONSTRAINT merchant_store_registration_progress_menu_upload_mode_check
      CHECK (
        menu_upload_mode IS NULL
        OR menu_upload_mode IN ('IMAGE', 'CSV', 'MANUAL')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_parent_status_step_idx
  ON public.merchant_store_registration_progress (parent_id, registration_status, current_step);

CREATE INDEX IF NOT EXISTS merchant_store_registration_progress_store_id_idx
  ON public.merchant_store_registration_progress (store_id)
  WHERE store_id IS NOT NULL;

-- Keep exactly one in-progress draft per parent when store is not yet created.
CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_registration_progress_parent_single_active_draft_idx
  ON public.merchant_store_registration_progress (parent_id)
  WHERE store_id IS NULL
    AND registration_status IN ('IN_PROGRESS', 'DRAFT');

-- 2) Menu draft table for step-3 manual builder (before final submit)
CREATE TABLE IF NOT EXISTS public.merchant_store_menu_drafts (
  id bigserial PRIMARY KEY,
  progress_id bigint NOT NULL REFERENCES public.merchant_store_registration_progress(id) ON DELETE CASCADE,
  store_id bigint NULL REFERENCES public.merchant_stores(id) ON DELETE SET NULL,
  category_name text NOT NULL,
  subcategory_name text,
  item_name text NOT NULL,
  food_type text NOT NULL DEFAULT 'VEG',
  item_description text,
  display_price numeric(10,2) NOT NULL CHECK (display_price > 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 5 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  percent_discount numeric(5,2) NOT NULL DEFAULT 0 CHECK (percent_discount >= 0 AND percent_discount <= 100),
  group_name text,
  group_min integer NOT NULL DEFAULT 0 CHECK (group_min >= 0),
  group_max integer NOT NULL DEFAULT 1 CHECK (group_max >= group_min),
  option_name text,
  option_price numeric(10,2),
  is_default_option boolean NOT NULL DEFAULT false,
  source_mode text NOT NULL DEFAULT 'MANUAL' CHECK (source_mode IN ('MANUAL', 'CSV', 'IMAGE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_store_menu_drafts_progress_id_idx
  ON public.merchant_store_menu_drafts (progress_id);

CREATE INDEX IF NOT EXISTS merchant_store_menu_drafts_store_id_idx
  ON public.merchant_store_menu_drafts (store_id)
  WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS merchant_store_menu_drafts_category_idx
  ON public.merchant_store_menu_drafts (category_name);

-- 3) Media metadata table (R2 mapping for profile/banner/gallery/menu/docs)
CREATE TABLE IF NOT EXISTS public.merchant_store_media_files (
  id bigserial PRIMARY KEY,
  store_id bigint NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  media_scope text NOT NULL CHECK (
    media_scope IN ('PROFILE', 'BANNER', 'GALLERY', 'MENU_ITEM', 'DOCUMENT', 'MENU_REFERENCE')
  ),
  source_entity text,
  source_entity_id bigint,
  original_file_name text,
  r2_key text NOT NULL,
  public_url text,
  mime_type text,
  file_size_bytes bigint,
  checksum_sha256 text,
  version_no integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS merchant_store_media_files_store_scope_idx
  ON public.merchant_store_media_files (store_id, media_scope);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_store_media_files_r2_key_idx
  ON public.merchant_store_media_files (r2_key);

CREATE INDEX IF NOT EXISTS merchant_store_media_files_active_idx
  ON public.merchant_store_media_files (store_id, is_active)
  WHERE is_active = true AND deleted_at IS NULL;

-- 4) Document verification timeline (who approved/rejected what and when)
CREATE TABLE IF NOT EXISTS public.merchant_store_document_verification_logs (
  id bigserial PRIMARY KEY,
  store_id bigint NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  document_number text,
  action text NOT NULL CHECK (action IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED')),
  old_status text,
  new_status text,
  action_reason text,
  verified_by integer,
  verified_by_name text,
  verified_by_email text,
  action_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_store_document_verification_logs_store_doc_idx
  ON public.merchant_store_document_verification_logs (store_id, document_type, created_at DESC);

-- 5) Add missing store FK links (safe IF-NOT-EXISTS style)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_menu_categories_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_menu_categories
      ADD CONSTRAINT merchant_menu_categories_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_menu_items_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_menu_items
      ADD CONSTRAINT merchant_menu_items_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_offers_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD CONSTRAINT merchant_offers_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_store_activity_log_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_store_activity_log
      ADD CONSTRAINT merchant_store_activity_log_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_store_manager_assignments_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_store_manager_assignments
      ADD CONSTRAINT merchant_store_manager_assignments_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_store_orders_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_store_orders
      ADD CONSTRAINT merchant_store_orders_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_store_commission_rules_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_store_commission_rules
      ADD CONSTRAINT merchant_store_commission_rules_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_store_bank_accounts_store_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_store_bank_accounts
      ADD CONSTRAINT merchant_store_bank_accounts_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6) Helpful status indexes for parent-child retrieval and review queues
CREATE INDEX IF NOT EXISTS merchant_stores_parent_status_onboarding_idx
  ON public.merchant_stores (parent_id, approval_status, onboarding_completed, current_onboarding_step);

CREATE INDEX IF NOT EXISTS merchant_stores_review_queue_idx
  ON public.merchant_stores (approval_status, created_at)
  WHERE approval_status IN ('DRAFT', 'SUBMITTED', 'REJECTED');

COMMIT;
