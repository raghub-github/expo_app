-- Parent–Area Manager mapping table
-- Allows assigning multiple Area Managers to a single parent merchant.

CREATE TABLE IF NOT EXISTS public.parent_area_managers (
  id BIGSERIAL NOT NULL,
  parent_id BIGINT NOT NULL,
  area_manager_id BIGINT NOT NULL,
  assigned_by BIGINT NULL,
  assigned_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT parent_area_managers_pkey PRIMARY KEY (id),
  CONSTRAINT unique_parent_am UNIQUE (parent_id, area_manager_id),
  CONSTRAINT fk_parent_area_manager_am FOREIGN KEY (area_manager_id) REFERENCES public.area_managers (id) ON DELETE CASCADE,
  CONSTRAINT fk_parent_area_manager_parent FOREIGN KEY (parent_id) REFERENCES public.merchant_parents (id) ON DELETE CASCADE
) TABLESPACE pg_default;

COMMENT ON TABLE public.parent_area_managers IS 'Mapping of parent merchants to assigned area managers (many-to-many).';
COMMENT ON COLUMN public.parent_area_managers.parent_id IS 'merchant_parents.id for which AMs are assigned.';
COMMENT ON COLUMN public.parent_area_managers.area_manager_id IS 'area_managers.id assigned to the parent.';
COMMENT ON COLUMN public.parent_area_managers.assigned_by IS 'system_users.id of admin/super admin who created the assignment.';
COMMENT ON COLUMN public.parent_area_managers.assigned_at IS 'Timestamp when assignment was created.';

