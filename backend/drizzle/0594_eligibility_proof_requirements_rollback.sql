ALTER TABLE rider_service_eligibility_rules
  DROP COLUMN IF EXISTS ev_proof_requirement,
  DROP COLUMN IF EXISTS ownership_proof_requirement,
  DROP COLUMN IF EXISTS commercial_proof_requirement;
