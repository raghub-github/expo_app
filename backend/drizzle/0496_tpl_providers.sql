-- Dispatch Engine — Phase 6: Third-Party Logistics (3PL) provider registry.
--
-- SCAFFOLD: the per-location "3PL enabled" toggle already lives on geo_coverage
-- (Phase 1) and is honored by serviceability (Phase 2). This table is the provider
-- REGISTRY that a real 3PL integration plugs into. No live dispatch wiring yet — an
-- adapter must be registered before orders are handed to a provider.

CREATE TABLE IF NOT EXISTS public.tpl_providers (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  service_types JSONB NOT NULL DEFAULT '["food","parcel"]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tpl_providers_priority_check CHECK (priority >= 0 AND priority <= 10000)
);

CREATE INDEX IF NOT EXISTS tpl_providers_enabled_priority_idx
  ON public.tpl_providers (enabled, priority);

COMMENT ON TABLE public.tpl_providers IS
  '3PL provider registry (lower priority = tried first). Config holds per-provider API creds/settings. Requires a registered adapter before live dispatch.';

DROP TRIGGER IF EXISTS tpl_providers_touch ON public.tpl_providers;
CREATE TRIGGER tpl_providers_touch
BEFORE UPDATE ON public.tpl_providers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
