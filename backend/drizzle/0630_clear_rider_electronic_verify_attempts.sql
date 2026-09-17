-- =============================================================================
-- 0630_clear_rider_electronic_verify_attempts.sql
-- One-shot hygiene: wipe ALL Verify Instantly attempt counters.
--
-- Where limits live (server SoT):
--   public.rider_electronic_verify_attempts
--     • 1 row per Verify Instantly click
--     • scoped by (rider_id, doc_kind) — pan | driving_licence | vehicle_rc |
--       aadhaar | bank_account
--     • cap = 2 clicks / doc_kind / 24h
--
-- NOT in Redis. Client AsyncStorage is only a mirror (ev_rate_limit_v2_*);
-- after this DELETE, check-* / electronic-verify-limits return allowed:true and
-- the app clears local locks (v1 relative mirrors are purged on load).
--
-- I/O: single DELETE on a small table; statement_timeout 15s.
-- =============================================================================

SET statement_timeout = '15s';

DELETE FROM public.rider_electronic_verify_attempts;

RESET statement_timeout;
