-- Audit log for Area Manager assignments/removals at parent/store level

CREATE TABLE IF NOT EXISTS public.parent_area_manager_activity (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT NOT NULL,
  store_id BIGINT NULL,
  area_manager_id BIGINT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('ASSIGN', 'REMOVE')),
  reason TEXT NULL,
  acted_by BIGINT NULL,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_pama_parent FOREIGN KEY (parent_id) REFERENCES public.merchant_parents (id) ON DELETE CASCADE,
  CONSTRAINT fk_pama_store FOREIGN KEY (store_id) REFERENCES public.merchant_stores (id) ON DELETE CASCADE,
  CONSTRAINT fk_pama_am FOREIGN KEY (area_manager_id) REFERENCES public.area_managers (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pama_parent_store_time
  ON public.parent_area_manager_activity (parent_id, store_id, acted_at DESC);

