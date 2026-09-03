-- Additional configurable vehicle-evidence document gates on the eligibility policy (§4, §13):
-- EV proof (EV vehicles), ownership proof, commercial permit/proof. All default 'exempt' so
-- existing policies are unchanged; admins opt in per geo/service.
ALTER TABLE rider_service_eligibility_rules
  ADD COLUMN IF NOT EXISTS ev_proof_requirement TEXT NOT NULL DEFAULT 'exempt'
    CHECK (ev_proof_requirement IN ('required', 'optional', 'exempt')),
  ADD COLUMN IF NOT EXISTS ownership_proof_requirement TEXT NOT NULL DEFAULT 'exempt'
    CHECK (ownership_proof_requirement IN ('required', 'optional', 'exempt')),
  ADD COLUMN IF NOT EXISTS commercial_proof_requirement TEXT NOT NULL DEFAULT 'exempt'
    CHECK (commercial_proof_requirement IN ('required', 'optional', 'exempt'));
