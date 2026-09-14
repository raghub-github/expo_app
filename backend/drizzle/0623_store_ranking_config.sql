-- Store-ranking config (Super Admin configurable, per profile, versioned).
--
-- Moves the food ranking config out of code into the DB so Super Admin can tune weights/caps/
-- windows and flip the engine on per profile, with an immutable revision history for audit and
-- rollback (spec §20/§35/§38). Seeded from the code default (HOME_FOOD), DISABLED — no ranking
-- behaviour changes until a Super Admin enables it. The engine still falls back to the code
-- default if a row is missing or unreadable, and a kill-switch env can force it off everywhere.

CREATE TABLE IF NOT EXISTS public.store_ranking_config (
  profile                   text PRIMARY KEY,
  enabled                   boolean NOT NULL DEFAULT false,
  version                   text NOT NULL DEFAULT 'home_food_v1',
  revision                  integer NOT NULL DEFAULT 1,
  weights                   jsonb NOT NULL,
  offer_weight              numeric(6, 2) NOT NULL DEFAULT 6,
  penalty_caps              jsonb NOT NULL,
  boost_caps                jsonb NOT NULL,
  refs                      jsonb NOT NULL,
  min_sample                integer NOT NULL DEFAULT 20,
  subscription_plan_boosts  jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by                text,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_ranking_config_profile_chk
    CHECK (profile IN ('HOME_FOOD', 'FOOD_CATEGORY', 'FOOD_SEARCH', 'FOOD_CUISINE', 'REORDER'))
);

-- Immutable revision history (one row appended per save) — rollback + traceability.
CREATE TABLE IF NOT EXISTS public.store_ranking_config_history (
  id          bigserial PRIMARY KEY,
  profile     text NOT NULL,
  revision    integer NOT NULL,
  enabled     boolean NOT NULL,
  version     text NOT NULL,
  config      jsonb NOT NULL,
  updated_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_ranking_config_history_profile_idx
  ON public.store_ranking_config_history (profile, created_at DESC);

-- Seed HOME_FOOD from the corrected code default (v1), DISABLED.
INSERT INTO public.store_ranking_config
  (profile, enabled, version, revision, weights, offer_weight, penalty_caps, boost_caps, refs,
   min_sample, subscription_plan_boosts)
VALUES (
  'HOME_FOOD', false, 'home_food_v1', 1,
  '{"distance":20,"deliverySpeed":12,"rating":18,"etaReliability":8,"kptReliability":10,"velocity":10,"availability":12}'::jsonb,
  6,
  '{"cancellation":14,"refund":8,"complaint":8,"oos":8}'::jsonb,
  '{"subscription":6,"newMerchant":6,"admin":10}'::jsonb,
  '{"distanceRefKm":8,"etaFastMin":20,"etaSlowMin":55,"ratingPriorMean":4.0,"ratingMinVotes":20,"velocityRefOrders":200,"penaltyRateRef":{"cancellation":0.2,"refund":0.15,"complaint":0.15,"oos":0.5}}'::jsonb,
  20,
  '{"BASIC":2,"PREMIUM":4,"ENTERPRISE":6,"PRO":6}'::jsonb
)
ON CONFLICT (profile) DO NOTHING;
