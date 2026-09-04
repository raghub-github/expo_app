-- Make DL OPTIONAL (was required) for FOOD at the state level, for all states.
-- Requested default change so food onboarding is the lowest barrier (cycles/e-bikes need
-- no licence); admins can set it back to required per state anytime.
--
-- Only touches food state rules that still carry the previous seeded default (dl=required),
-- so any state an admin already customised to a different DL setting is left untouched.

UPDATE rider_service_eligibility_rules
SET dl_requirement = 'optional', updated_at = now()
WHERE geo_level = 'state'::geo_pricing_level
  AND service_type = 'food'
  AND dl_requirement = 'required'
  AND deleted_at IS NULL;
