-- Extend rider_onboarding_vehicle_types.document_requirements JSON with optional_docs.
-- Shape: { required_docs: string[], optional_docs?: string[], has_own_vehicle?: boolean, requires_max_speed?: boolean }
-- Required docs must be uploaded during onboarding; optional docs may be skipped by the rider.

COMMENT ON COLUMN rider_onboarding_vehicle_types.document_requirements IS
  'JSON: { required_docs: string[], optional_docs?: string[], has_own_vehicle?: boolean, requires_max_speed?: boolean }';
