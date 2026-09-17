-- =============================================================================
-- 0632_clear_rider_electronic_verify_attempts_v2.sql
-- Wipe ALL Verify Instantly attempt counters again after root-cause fix.
--
-- SoT: public.rider_electronic_verify_attempts (rider_id + doc_kind).
-- No Redis. check-* no longer attaches rate-limit fields.
-- Cooldown = MIN(created_at)+24h per doc — never invent now+24h.
--
-- I/O: single DELETE; statement_timeout 15s.
-- =============================================================================

SET statement_timeout = '15s';

DELETE FROM public.rider_electronic_verify_attempts;

RESET statement_timeout;
