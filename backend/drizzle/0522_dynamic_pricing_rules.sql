-- Phase C — reusable geo + time DYNAMIC PRICING engine (Night / Rain / Peak / Festival /
-- Holiday / High-demand / Manual). One table drives configurable surcharges for ALL
-- services, resolved CLOSEST-ANCESTOR-WINS per mode on the geo chain (like offers /
-- delivery slabs), with a time-of-day + day-of-week + date window and funding split
-- (customer / company / shared). The CUSTOMER-borne portion is added to the bill; the
-- COMPANY-borne portion is recorded for rider incentive / settlement.

CREATE TABLE IF NOT EXISTS dynamic_pricing_rules (
  id                 bigserial PRIMARY KEY,
  -- NIGHT | RAIN | PEAK | FESTIVAL | HOLIDAY | HIGH_DEMAND | LOW_SUPPLY | MANUAL
  mode               text NOT NULL,
  -- 'food' | 'parcel' | 'person_ride' | 'all'
  service_type       text NOT NULL DEFAULT 'all',
  geo_level          geo_pricing_level NOT NULL,
  geo_ref_id         uuid NOT NULL,
  name               text NULL,
  -- FIXED (₹) | PER_KM (₹/km) | PERCENTAGE (% of fare) | MULTIPLIER (× fare, surcharge = (m-1)×fare)
  value_type         text NOT NULL DEFAULT 'FIXED',
  value              numeric(12, 4) NOT NULL DEFAULT 0,
  -- optional cap on the computed surcharge (₹)
  max_amount         numeric(12, 2) NULL,
  -- who bears it: 'customer' (added to bill), 'company' (absorbed / rider incentive), 'shared'
  funding            text NOT NULL DEFAULT 'customer',
  customer_share_pct numeric(5, 2) NOT NULL DEFAULT 100,
  -- GST on the CUSTOMER-borne portion. Off by default; rate set by admin/CA (never invented).
  taxable            boolean NOT NULL DEFAULT false,
  gst_rate           numeric(6, 4) NOT NULL DEFAULT 0,
  -- time-of-day window (local). NULL start/end + all_day=true => applies any time in the date/day window.
  all_day            boolean NOT NULL DEFAULT false,
  start_time         time NULL,
  end_time           time NULL,
  -- ISO dow 0..6 (0=Sunday). Empty/NULL => every day.
  days_of_week       integer[] NULL,
  -- optional absolute date window (festival etc.)
  active_from        timestamptz NULL,
  active_to          timestamptz NULL,
  -- MANUAL mode / admin override: force-on regardless of time window while is_active.
  manual_active      boolean NOT NULL DEFAULT false,
  priority           integer NOT NULL DEFAULT 100,
  is_active          boolean NOT NULL DEFAULT true,
  created_by         text NULL,
  updated_by         text NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dyn_pricing_mode_chk CHECK (mode IN
    ('NIGHT','RAIN','PEAK','FESTIVAL','HOLIDAY','HIGH_DEMAND','LOW_SUPPLY','MANUAL')),
  CONSTRAINT dyn_pricing_service_chk CHECK (service_type IN ('food','parcel','person_ride','all')),
  CONSTRAINT dyn_pricing_value_type_chk CHECK (value_type IN ('FIXED','PER_KM','PERCENTAGE','MULTIPLIER')),
  CONSTRAINT dyn_pricing_funding_chk CHECK (funding IN ('customer','company','shared')),
  CONSTRAINT dyn_pricing_share_chk CHECK (customer_share_pct >= 0 AND customer_share_pct <= 100),
  CONSTRAINT dyn_pricing_value_nonneg CHECK (value >= 0),
  CONSTRAINT dyn_pricing_gst_nonneg CHECK (gst_rate >= 0),
  CONSTRAINT dyn_pricing_max_nonneg CHECK (max_amount IS NULL OR max_amount >= 0),
  CONSTRAINT dyn_pricing_daterange_chk CHECK (active_to IS NULL OR active_from IS NULL OR active_to > active_from),
  -- one row per (node, service, mode) — admins edit in place
  CONSTRAINT dyn_pricing_uniq UNIQUE (geo_level, geo_ref_id, service_type, mode)
);

CREATE INDEX IF NOT EXISTS dyn_pricing_geo_idx
  ON dynamic_pricing_rules (geo_level, geo_ref_id, service_type, is_active);
CREATE INDEX IF NOT EXISTS dyn_pricing_service_idx
  ON dynamic_pricing_rules (service_type, is_active);

-- Effective rows for a location + service: the CLOSEST ancestor (incl. self) on the geo
-- chain that has an active row for each mode. Also includes rows whose service_type='all'
-- (resolved independently per mode). Returns 0..N rows (one per applicable mode). Time-window
-- matching is done in the application layer (testable, DST-safe) — this only does geo + active.
CREATE OR REPLACE FUNCTION dynamic_pricing_rules_effective(
  p_level   geo_pricing_level,
  p_id      uuid,
  p_service text
) RETURNS SETOF dynamic_pricing_rules
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (r.mode, r.service_type) r.*
  FROM geo_pricing_chain_steps(p_level, p_id) c
  JOIN dynamic_pricing_rules r
    ON r.geo_level = c.step_level AND r.geo_ref_id = c.step_id
  WHERE r.is_active = true
    AND (r.service_type = p_service OR r.service_type = 'all')
    AND (r.active_from IS NULL OR r.active_from <= now())
    AND (r.active_to   IS NULL OR r.active_to   >  now())
  ORDER BY r.mode, r.service_type, c.step_ord ASC, r.priority DESC, r.id ASC;
$$;

COMMENT ON TABLE dynamic_pricing_rules IS
  'Geo + time dynamic pricing (night/rain/peak/festival/…) for all services. Closest-ancestor-wins per mode; funding split customer/company/shared; customer portion billed, company portion recorded.';
