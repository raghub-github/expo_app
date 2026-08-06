-- Backfill package capacity dims for parcel rows placed before placement wired weight/LWH.
-- Defaults match customer book-screen capacity by vehicle_category.

UPDATE orders_parcel
SET
  weight_kg = CASE vehicle_category
    WHEN '2_wheeler' THEN 20
    WHEN '3_wheeler' THEN 100
    WHEN '4_wheeler_non_ac' THEN 200
    ELSE COALESCE(weight_kg, 20)
  END,
  length_cm = CASE vehicle_category
    WHEN '2_wheeler' THEN 40
    WHEN '3_wheeler' THEN 150
    WHEN '4_wheeler_non_ac' THEN 220
    ELSE COALESCE(length_cm, 40)
  END,
  width_cm = CASE vehicle_category
    WHEN '2_wheeler' THEN 40
    WHEN '3_wheeler' THEN 130
    WHEN '4_wheeler_non_ac' THEN 140
    ELSE COALESCE(width_cm, 40)
  END,
  height_cm = CASE vehicle_category
    WHEN '2_wheeler' THEN 40
    WHEN '3_wheeler' THEN 130
    WHEN '4_wheeler_non_ac' THEN 180
    ELSE COALESCE(height_cm, 40)
  END,
  updated_at = NOW()
WHERE weight_kg IS NULL
   OR length_cm IS NULL
   OR width_cm IS NULL
   OR height_cm IS NULL;
