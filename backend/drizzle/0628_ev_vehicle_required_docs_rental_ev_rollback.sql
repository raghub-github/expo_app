-- Rollback 0628: restore EV catalog to dl+rc required (pre-fix mismatch state).
UPDATE public.rider_onboarding_vehicle_types
SET
  document_requirements = jsonb_build_object(
    'required_docs', jsonb_build_array('dl', 'rc'),
    'optional_docs', jsonb_build_array('rental_proof', 'ev_proof'),
    'has_own_vehicle', true
  ),
  hint = 'Rental or EV proof required',
  info_message = CASE code
    WHEN 'ev_bike' THEN 'Upload a rental agreement or EV proof if applicable to continue with EV bike onboarding.'
    WHEN 'ev_auto' THEN 'Upload rental agreement or EV proof if applicable for EV auto onboarding.'
    WHEN 'ev_car_ac' THEN 'Upload rental agreement or EV proof if applicable for EV car onboarding.'
    ELSE info_message
  END,
  updated_at = NOW()
WHERE code IN ('ev_bike', 'ev_auto', 'ev_car_ac');
