-- Multi-rider assignment history + per-rider milestone timeline (Mx/Cx distances).
-- Migration: 0278_order_rider_assignment_timeline
--
-- Links every rider ever assigned to an order (orders_core) and stores append-only
-- timeline events: assigned → accepted → reached_merchant → picked_up → delivered.

-- ---------------------------------------------------------------------------
-- 1) Extend order_rider_assignments for orders_core + assignment sequence
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rider_assignment_status') THEN
    CREATE TYPE rider_assignment_status AS ENUM (
      'pending',
      'assigned',
      'accepted',
      'rejected',
      'cancelled',
      'completed',
      'failed',
      'unassigned'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'rider_assignment_status'
      AND e.enumlabel = 'unassigned'
  ) THEN
    ALTER TYPE rider_assignment_status ADD VALUE 'unassigned';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.order_rider_assignments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  rider_id INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE RESTRICT,
  rider_name TEXT,
  rider_mobile TEXT,
  assignment_status rider_assignment_status NOT NULL DEFAULT 'pending',
  assigned_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  reached_merchant_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  assignment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.order_rider_assignments
  ADD COLUMN IF NOT EXISTS order_core_id BIGINT REFERENCES public.orders_core(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS order_id_text TEXT,
  ADD COLUMN IF NOT EXISTS assignment_sequence INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS unassigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS distance_to_merchant_km NUMERIC(8, 3),
  ADD COLUMN IF NOT EXISTS distance_to_customer_km NUMERIC(8, 3);

COMMENT ON COLUMN public.order_rider_assignments.order_core_id IS
  'FK to orders_core.id — canonical order PK for food/parcel/ride.';
COMMENT ON COLUMN public.order_rider_assignments.order_id_text IS
  'Business order id text (orders_core.order_id), e.g. GMF100028.';
COMMENT ON COLUMN public.order_rider_assignments.assignment_sequence IS
  '1-based attempt number for this order (supports multiple riders over lifetime).';
COMMENT ON COLUMN public.order_rider_assignments.is_active IS
  'True for the single currently active assignment row on this order.';

-- Backfill orders_core linkage from legacy order_id (= orders_core.id in OMS v2)
UPDATE public.order_rider_assignments ora
SET order_core_id = ora.order_id
WHERE ora.order_core_id IS NULL
  AND EXISTS (SELECT 1 FROM public.orders_core oc WHERE oc.id = ora.order_id);

UPDATE public.order_rider_assignments ora
SET order_id_text = oc.order_id
FROM public.orders_core oc
WHERE ora.order_core_id = oc.id
  AND (ora.order_id_text IS NULL OR ora.order_id_text = '');

-- OMS v2: order_id stores orders_core.id — repoint FK away from legacy public.orders
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'order_rider_assignments'
      AND constraint_name = 'order_rider_assignments_order_id_fkey'
  ) THEN
    ALTER TABLE public.order_rider_assignments
      DROP CONSTRAINT order_rider_assignments_order_id_fkey;
  END IF;
END $$;

-- Drop orphan rows that cannot link to orders_core (legacy data only)
DELETE FROM public.order_rider_assignments ora
WHERE NOT EXISTS (
  SELECT 1 FROM public.orders_core oc WHERE oc.id = ora.order_id
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'order_rider_assignments'
      AND constraint_name = 'order_rider_assignments_order_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders_core'
  ) THEN
    ALTER TABLE public.order_rider_assignments
      ADD CONSTRAINT order_rider_assignments_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders_core(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Assignment sequence per order
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(order_core_id, order_id)
      ORDER BY COALESCE(accepted_at, assigned_at, created_at) ASC, id ASC
    ) AS seq
  FROM public.order_rider_assignments
)
UPDATE public.order_rider_assignments ora
SET assignment_sequence = ranked.seq
FROM ranked
WHERE ora.id = ranked.id;

CREATE INDEX IF NOT EXISTS order_rider_assignments_order_core_id_idx
  ON public.order_rider_assignments (order_core_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_rider_assignments_order_id_text_idx
  ON public.order_rider_assignments (order_id_text, created_at DESC);

CREATE INDEX IF NOT EXISTS order_rider_assignments_active_idx
  ON public.order_rider_assignments (order_core_id)
  WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS order_rider_assignments_one_active_per_order_idx
  ON public.order_rider_assignments (order_core_id)
  WHERE is_active = TRUE AND order_core_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Append-only rider assignment timeline (Mx / Cx per milestone)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_rider_assignment_timeline_events (
  id BIGSERIAL PRIMARY KEY,
  rider_assignment_id BIGINT NOT NULL
    REFERENCES public.order_rider_assignments(id) ON DELETE CASCADE,
  order_core_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  order_id_text TEXT NOT NULL,
  rider_id INTEGER NOT NULL REFERENCES public.riders(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  merchant_distance_km NUMERIC(8, 3),
  customer_distance_km NUMERIC(8, 3),
  rider_latitude NUMERIC(10, 7),
  rider_longitude NUMERIC(10, 7),
  status_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_rider_assignment_timeline_events_type_check CHECK (
    event_type IN (
      'assigned',
      'accepted',
      'reached_merchant',
      'picked_up',
      'delivered',
      'rejected',
      'cancelled',
      'unassigned',
      'timeout'
    )
  ),
  CONSTRAINT order_rider_assignment_timeline_events_one_per_type UNIQUE (
    rider_assignment_id,
    event_type
  )
);

COMMENT ON TABLE public.order_rider_assignment_timeline_events IS
  'Append-only rider milestone timeline per assignment. Mx = rider→merchant km, Cx = rider→customer km at event time.';
COMMENT ON COLUMN public.order_rider_assignment_timeline_events.merchant_distance_km IS
  'Rider distance to merchant (Mx) at this milestone.';
COMMENT ON COLUMN public.order_rider_assignment_timeline_events.customer_distance_km IS
  'Rider distance to customer drop (Cx) at this milestone.';

CREATE INDEX IF NOT EXISTS order_rider_assignment_timeline_order_core_idx
  ON public.order_rider_assignment_timeline_events (order_core_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS order_rider_assignment_timeline_assignment_idx
  ON public.order_rider_assignment_timeline_events (rider_assignment_id, occurred_at ASC);

CREATE INDEX IF NOT EXISTS order_rider_assignment_timeline_rider_idx
  ON public.order_rider_assignment_timeline_events (rider_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Convenience view: total riders assigned per order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.order_rider_assignment_order_summary AS
SELECT
  COALESCE(ora.order_core_id, ora.order_id) AS order_core_id,
  MAX(ora.order_id_text) AS order_id_text,
  COUNT(*)::INTEGER AS total_rider_assignments,
  COUNT(DISTINCT ora.rider_id)::INTEGER AS distinct_riders,
  COUNT(*) FILTER (
    WHERE ora.assignment_status IN ('accepted', 'completed')
  )::INTEGER AS accepted_assignments,
  MAX(ora.accepted_at) FILTER (WHERE ora.is_active) AS active_rider_accepted_at,
  MAX(ora.rider_id) FILTER (WHERE ora.is_active) AS active_rider_id
FROM public.order_rider_assignments ora
GROUP BY COALESCE(ora.order_core_id, ora.order_id);

COMMENT ON VIEW public.order_rider_assignment_order_summary IS
  'Per-order rider assignment counts for merchant Past riders panel.';

-- ---------------------------------------------------------------------------
-- 4) Backfill timeline from existing assignment timestamps (best effort)
-- ---------------------------------------------------------------------------

INSERT INTO public.order_rider_assignment_timeline_events (
  rider_assignment_id,
  order_core_id,
  order_id_text,
  rider_id,
  event_type,
  occurred_at,
  merchant_distance_km,
  customer_distance_km,
  status_message
)
SELECT
  ora.id,
  COALESCE(ora.order_core_id, ora.order_id),
  COALESCE(ora.order_id_text, oc.order_id, ''),
  ora.rider_id,
  ev.event_type,
  ev.occurred_at,
  ora.distance_to_merchant_km,
  ora.distance_to_customer_km,
  ev.status_message
FROM public.order_rider_assignments ora
LEFT JOIN public.orders_core oc ON oc.id = COALESCE(ora.order_core_id, ora.order_id)
CROSS JOIN LATERAL (
  VALUES
    ('assigned'::text, ora.assigned_at, 'Rider assigned'),
    ('accepted'::text, ora.accepted_at, 'Rider accepted'),
    ('reached_merchant'::text, ora.reached_merchant_at, 'Rider reached merchant'),
    ('picked_up'::text, ora.picked_up_at, 'Order picked up'),
    ('delivered'::text, ora.delivered_at, 'Order delivered'),
    ('rejected'::text, ora.rejected_at, 'Rider rejected'),
    ('cancelled'::text, ora.cancelled_at, 'Assignment cancelled'),
    ('unassigned'::text, ora.unassigned_at, 'Rider unassigned')
) AS ev(event_type, occurred_at, status_message)
WHERE ev.occurred_at IS NOT NULL
  AND COALESCE(ora.order_core_id, ora.order_id) IS NOT NULL
ON CONFLICT (rider_assignment_id, event_type) DO NOTHING;

-- Backfill from delivery_assignments where no order_rider_assignments row exists yet
INSERT INTO public.order_rider_assignments (
  order_id,
  order_core_id,
  order_id_text,
  rider_id,
  assignment_status,
  assigned_at,
  accepted_at,
  picked_up_at,
  delivered_at,
  is_active,
  service_type,
  assignment_sequence
)
SELECT
  oc.id,
  oc.id,
  da.order_id,
  da.rider_id,
  CASE
    WHEN da.delivered_at IS NOT NULL THEN 'completed'::rider_assignment_status
    WHEN da.picked_up_at IS NOT NULL THEN 'accepted'::rider_assignment_status
    WHEN da.accepted_at IS NOT NULL THEN 'accepted'::rider_assignment_status
    ELSE 'assigned'::rider_assignment_status
  END,
  da.assigned_at,
  da.accepted_at,
  da.picked_up_at,
  da.delivered_at,
  TRUE,
  COALESCE(oc.order_type, 'food'),
  1
FROM public.delivery_assignments da
INNER JOIN public.orders_core oc ON oc.order_id = da.order_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.order_rider_assignments ora
  WHERE ora.order_core_id = oc.id
    AND ora.rider_id = da.rider_id
);
