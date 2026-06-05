-- Person ride pickup OTP uses milestone pickup_confirmation (same as parcel).

ALTER TABLE public.platform_rider_status_radius_rules
  DROP CONSTRAINT IF EXISTS platform_rider_status_radius_rules_milestone_check;

ALTER TABLE public.platform_rider_status_radius_rules
  ADD CONSTRAINT platform_rider_status_radius_rules_milestone_check
  CHECK (
    (service_type = 'food' AND milestone_key IN (
      'reach_store', 'mark_picked_up', 'reach_customer', 'mark_delivered'
    ))
    OR (service_type = 'parcel' AND milestone_key IN (
      'reach_pickup', 'pickup_confirmation', 'reach_drop', 'delivery_confirmation'
    ))
    OR (service_type = 'person_ride' AND milestone_key IN (
      'reach_pickup', 'pickup_confirmation', 'start_ride', 'reach_destination', 'complete_ride'
    ))
  );

INSERT INTO public.platform_rider_status_radius_rules (service_type, milestone_key, radius_meters)
VALUES ('person_ride', 'pickup_confirmation', 300)
ON CONFLICT (service_type, milestone_key) DO NOTHING;
