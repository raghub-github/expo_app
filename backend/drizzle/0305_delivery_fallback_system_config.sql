-- Platform-wide delivery fallback rates (when geo slabs invalid / pincode not mapped).
-- Managed from Super Admin → Delivery fallback rates.

INSERT INTO system_config (config_key, config_value, value_type, description, category)
VALUES
  (
    'delivery.fallback_base_inr',
    '25',
    'number',
    'Base delivery fee (INR) per order when no geo slab applies',
    'delivery'
  ),
  (
    'delivery.fallback_per_km_inr',
    '5',
    'number',
    'Per-km delivery fee (INR) added to base when no geo slab applies',
    'delivery'
  ),
  (
    'delivery.min_fee_inr',
    '0',
    'number',
    'Minimum delivery fee floor (INR) after fallback formula; 0 = no floor',
    'delivery'
  )
ON CONFLICT (config_key) DO NOTHING;
