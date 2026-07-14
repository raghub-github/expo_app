-- Rider Fare Engine v3.0: percentage-based rider payout, derived from customer fare.
-- Replaces the slab-based rider payout engine (food/parcel/ride_rider_pickup_slabs,
-- food/parcel/ride_rider_drop_slabs). Customer pricing is unchanged.
--
-- Old rider slab tables are DEPRECATED by this migration (see COMMENT ON TABLE below)
-- but not dropped — CONTRIBUTING.md requires a documented deprecation window before
-- destructive schema changes. A follow-up migration will DROP them after 2026-07-26.

CREATE TABLE IF NOT EXISTS service_payout_rules (
  id bigserial PRIMARY KEY,
  service_type text NOT NULL,
  geo_level geo_pricing_level NOT NULL,
  geo_ref_id uuid NOT NULL,
  rider_percentage numeric(5, 2) NOT NULL,
  platform_percentage numeric(5, 2) NOT NULL,
  waiting_charge_per_min numeric(14, 6) NULL,
  waiting_free_minutes integer NOT NULL DEFAULT 2,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NULL,
  effective_to timestamptz NULL,
  deleted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_payout_rules_service_type_valid CHECK (
    service_type IN ('food', 'parcel', 'ride')
  ),
  CONSTRAINT service_payout_rules_rider_pct_range CHECK (
    rider_percentage > 0 AND rider_percentage <= 100
  ),
  CONSTRAINT service_payout_rules_platform_pct_range CHECK (
    platform_percentage >= 0 AND platform_percentage < 100
  ),
  CONSTRAINT service_payout_rules_pct_sum CHECK (
    rider_percentage + platform_percentage = 100
  ),
  CONSTRAINT service_payout_rules_waiting_rate_nonneg CHECK (
    waiting_charge_per_min IS NULL OR waiting_charge_per_min >= 0
  ),
  CONSTRAINT service_payout_rules_waiting_free_nonneg CHECK (waiting_free_minutes >= 0),
  CONSTRAINT service_payout_rules_priority_nonneg CHECK (priority >= 0),
  CONSTRAINT service_payout_rules_effective_range CHECK (
    effective_from IS NULL OR effective_to IS NULL OR effective_from < effective_to
  )
);

CREATE INDEX IF NOT EXISTS service_payout_rules_geo_idx
  ON service_payout_rules (geo_level, geo_ref_id, service_type, is_active)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS service_payout_rules_geo_priority_idx
  ON service_payout_rules (geo_level, geo_ref_id, service_type, priority DESC, id ASC)
  WHERE deleted_at IS NULL AND is_active = true;

COMMENT ON TABLE service_payout_rules IS
  'Rider Fare Engine v3.0: rider payout = rider_percentage of the final customer fare, split pickup/drop purely by distance ratio (pickupKm/totalKm). No guardrails — intentionally simple and fully distance-driven, so the split can never be forced to a fixed ratio. Resolved via geo_pricing_chain_steps() nearest-ancestor inheritance, same as the deprecated rider slab tables.';

-- ─── Deprecate the old slab-based rider payout tables ─────────────────────────
-- Runtime code no longer queries these (see riderPayoutPricing.repository.ts).
-- Kept in place per CONTRIBUTING.md's additive-migration policy; physically
-- dropped in a follow-up migration after the deprecation window below.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'food_rider_pickup_slabs') THEN
    COMMENT ON TABLE food_rider_pickup_slabs IS 'DEPRECATED 2026-07-12: superseded by service_payout_rules (Rider Fare Engine v3.0). No longer queried at runtime. Scheduled for DROP after 2026-07-26.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'food_rider_drop_slabs') THEN
    COMMENT ON TABLE food_rider_drop_slabs IS 'DEPRECATED 2026-07-12: superseded by service_payout_rules (Rider Fare Engine v3.0). No longer queried at runtime. Scheduled for DROP after 2026-07-26.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'parcel_rider_pickup_slabs') THEN
    COMMENT ON TABLE parcel_rider_pickup_slabs IS 'DEPRECATED 2026-07-12: superseded by service_payout_rules (Rider Fare Engine v3.0). No longer queried at runtime. Scheduled for DROP after 2026-07-26.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'parcel_rider_drop_slabs') THEN
    COMMENT ON TABLE parcel_rider_drop_slabs IS 'DEPRECATED 2026-07-12: superseded by service_payout_rules (Rider Fare Engine v3.0). No longer queried at runtime. Scheduled for DROP after 2026-07-26.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ride_rider_pickup_slabs') THEN
    COMMENT ON TABLE ride_rider_pickup_slabs IS 'DEPRECATED 2026-07-12: superseded by service_payout_rules (Rider Fare Engine v3.0). No longer queried at runtime. Scheduled for DROP after 2026-07-26.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ride_rider_drop_slabs') THEN
    COMMENT ON TABLE ride_rider_drop_slabs IS 'DEPRECATED 2026-07-12: superseded by service_payout_rules (Rider Fare Engine v3.0). No longer queried at runtime. Scheduled for DROP after 2026-07-26.';
  END IF;
END
$$;
