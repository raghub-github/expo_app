-- Merchant Plans: subscription plans for merchants
-- billing_cycle_type enum + merchant_plans table

DO $$ BEGIN
  CREATE TYPE public.billing_cycle_type AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.merchant_plans (
  id BIGSERIAL NOT NULL,
  plan_name TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  description TEXT NULL,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  billing_cycle public.billing_cycle_type NOT NULL DEFAULT 'MONTHLY'::public.billing_cycle_type,
  max_menu_items INTEGER NULL,
  max_cuisines INTEGER NULL,
  max_menu_categories INTEGER NULL,
  image_upload_allowed BOOLEAN NULL DEFAULT false,
  max_image_uploads INTEGER NULL DEFAULT 0,
  analytics_access BOOLEAN NULL DEFAULT false,
  advanced_analytics BOOLEAN NULL DEFAULT false,
  priority_support BOOLEAN NULL DEFAULT false,
  marketing_automation BOOLEAN NULL DEFAULT false,
  custom_api_integrations BOOLEAN NULL DEFAULT false,
  dedicated_account_manager BOOLEAN NULL DEFAULT false,
  display_order INTEGER NULL DEFAULT 0,
  is_active BOOLEAN NULL DEFAULT true,
  is_popular BOOLEAN NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NULL DEFAULT now(),
  CONSTRAINT merchant_plans_pkey PRIMARY KEY (id),
  CONSTRAINT merchant_plans_plan_code_key UNIQUE (plan_code),
  CONSTRAINT merchant_plans_plan_name_key UNIQUE (plan_name)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS merchant_plans_plan_code_idx ON public.merchant_plans USING btree (plan_code) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS merchant_plans_is_active_idx ON public.merchant_plans USING btree (is_active) TABLESPACE pg_default;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid WHERE c.relname = 'merchant_plans' AND t.tgname = 'update_merchant_plans_updated_at') THEN
    CREATE TRIGGER update_merchant_plans_updated_at
      BEFORE UPDATE ON public.merchant_plans
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
EXCEPTION
  WHEN undefined_function THEN NULL;
END $$;
