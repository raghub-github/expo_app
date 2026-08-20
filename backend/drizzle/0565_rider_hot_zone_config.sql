-- Super-Admin config for the rider hot-zone engine (Part 20/47). Single global row for
-- v1 (per-city rows can be added later with a nullable city scope). All business
-- thresholds live here — never hard-coded in the app or the algorithm.
CREATE TABLE IF NOT EXISTS public.rider_hot_zone_config (
  id smallint PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  -- spatial
  h3_resolution smallint NOT NULL DEFAULT 8,          -- ~0.7km hex edge; configurable by density
  neighborhood_rings smallint NOT NULL DEFAULT 2,     -- how many H3 rings around the rider to return
  supply_radius_meters integer NOT NULL DEFAULT 6000, -- radius for the canonical candidate query
  -- demand
  demand_window_seconds integer NOT NULL DEFAULT 900,     -- only orders newer than this count (15 min)
  demand_half_life_seconds integer NOT NULL DEFAULT 600,  -- time-decay half-life (10 min)
  min_weighted_demand numeric NOT NULL DEFAULT 3,         -- gate: below this a cell is always NORMAL
  -- supply
  supply_ring_decay numeric NOT NULL DEFAULT 0.5,         -- neighbouring-cell influence per ring
  min_supply_floor numeric NOT NULL DEFAULT 0.5,          -- denominator floor (no div-by-zero)
  location_freshness_max_age_minutes integer NOT NULL DEFAULT 10, -- reuse dispatch freshness default
  -- pressure classification (ascending) + hysteresis
  warm_at numeric NOT NULL DEFAULT 1.0,
  hot_at numeric NOT NULL DEFAULT 1.5,
  critical_at numeric NOT NULL DEFAULT 2.0,
  hysteresis_margin numeric NOT NULL DEFAULT 0.25,
  -- lifecycle
  validity_seconds integer NOT NULL DEFAULT 120,         -- how long a computed zone is valid (Part 29)
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_hot_zone_config_singleton CHECK (id = 1)
);

INSERT INTO public.rider_hot_zone_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
