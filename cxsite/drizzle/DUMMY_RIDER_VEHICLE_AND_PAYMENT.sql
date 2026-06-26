-- =============================================================================
-- DUMMY DATA: Riders 1003 & 1006
-- Run this in Supabase SQL Editor. Safe to run multiple times (idempotent where possible).
--
-- Sections:
--   1) vehicle_choice on riders (EV / Petrol)
--   2) rider_vehicles (vehicle details: type, fuel, make, model, service_types)
--   3) onboarding_payments (full onboarding fee data: amount, provider, ref_id, payment_id, status, metadata)
--   4) rider_wallet (total_balance, service-wise earnings_food/parcel/person_ride, penalties, total_withdrawn)
--   5) wallet_ledger (service-wise earning, penalty, onboarding_fee, withdrawal/adjustment entries)
--   6) rider_penalties (service-wise: food, parcel, person_ride)
--   7) withdrawal_requests (pending + completed)
--
-- Vehicle / transport mode:
--   - public.riders.vehicle_choice  = 'EV' or 'Petrol'
--   - public.rider_vehicles        = vehicle_type, fuel_type, make, model, registration_number, service_types
-- =============================================================================

-- 1) Set vehicle_choice on riders (used by onboarding logic: EV vs Petrol)
UPDATE public.riders
SET vehicle_choice = 'Petrol', updated_at = NOW()
WHERE id = 1003;

UPDATE public.riders
SET vehicle_choice = 'EV', updated_at = NOW()
WHERE id = 1006;

-- 2) Insert rider_vehicles (one active vehicle per rider)
-- Transport mode / vehicle type: rider_vehicles.vehicle_type, fuel_type, make, model, etc.
-- Only insert if no active vehicle exists for that rider.

INSERT INTO public.rider_vehicles (
  rider_id,
  vehicle_type,
  registration_number,
  make,
  model,
  year,
  color,
  fuel_type,
  vehicle_category,
  ac_type,
  service_types,
  verified,
  is_active,
  created_at,
  updated_at
)
SELECT 1003, 'bike'::vehicle_type, 'KA-03-EF-9012', 'Honda', 'Activa 6G', 2023, 'Black', 'Petrol'::fuel_type, 'Scooter'::vehicle_category, NULL, '["food","parcel","person_ride"]'::jsonb, true, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.rider_vehicles WHERE rider_id = 1003 AND is_active = true);

INSERT INTO public.rider_vehicles (
  rider_id,
  vehicle_type,
  registration_number,
  make,
  model,
  year,
  color,
  fuel_type,
  vehicle_category,
  ac_type,
  service_types,
  verified,
  is_active,
  created_at,
  updated_at
)
SELECT 1006, 'bike'::vehicle_type, 'TN-01-AB-1234', 'Ola', 'S1 Pro', 2024, 'White', 'EV'::fuel_type, 'Scooter'::vehicle_category, NULL, '["food","parcel"]'::jsonb, true, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.rider_vehicles WHERE rider_id = 1006 AND is_active = true);

-- 3) Onboarding payment – full payment data (all fields + metadata) for onboarding fees
-- status must be 'completed' for checkOnboardingPaymentCompleted() to return true.

INSERT INTO public.onboarding_payments (
  rider_id,
  amount,
  provider,
  ref_id,
  payment_id,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT
  1003,
  500.00,
  'razorpay',
  'onbr_ref_1003_' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
  'pay_rzp_1003_' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
  'completed',
  jsonb_build_object(
    'gateway', 'razorpay',
    'order_id', 'order_onbr_1003_' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
    'captured', true,
    'fee_amount', 10.00,
    'tax', 0,
    'currency', 'INR',
    'method', 'upi',
    'bank', null,
    'wallet', null,
    'email', null,
    'contact', null,
    'created_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_payments WHERE rider_id = 1003 AND status = 'completed');

INSERT INTO public.onboarding_payments (
  rider_id,
  amount,
  provider,
  ref_id,
  payment_id,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT
  1006,
  500.00,
  'razorpay',
  'onbr_ref_1006_' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
  'pay_rzp_1006_' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
  'completed',
  jsonb_build_object(
    'gateway', 'razorpay',
    'order_id', 'order_onbr_1006_' || to_char(NOW(), 'YYYYMMDDHH24MISS'),
    'captured', true,
    'fee_amount', 10.00,
    'tax', 0,
    'currency', 'INR',
    'method', 'card',
    'bank', null,
    'wallet', null,
    'email', null,
    'contact', null,
    'created_at', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ),
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_payments WHERE rider_id = 1006 AND status = 'completed');

-- =============================================================================
-- 4) RIDER WALLET – wallet amount, service-wise earnings, service-wise penalties, withdrawal
-- =============================================================================

INSERT INTO public.rider_wallet (
  rider_id,
  total_balance,
  earnings_food,
  earnings_parcel,
  earnings_person_ride,
  penalties_food,
  penalties_parcel,
  penalties_person_ride,
  total_withdrawn,
  last_updated_at,
  created_at
)
VALUES
  (1003, 2850.00, 1200.00, 800.00, 500.00, 50.00, 0, 0, 600.00, NOW(), NOW()),
  (1006, 1920.00, 2850.00, 620.00, 400.00, 0, 250.00, 0, 900.00, NOW(), NOW())
ON CONFLICT (rider_id) DO UPDATE SET
  total_balance = EXCLUDED.total_balance,
  earnings_food = EXCLUDED.earnings_food,
  earnings_parcel = EXCLUDED.earnings_parcel,
  earnings_person_ride = EXCLUDED.earnings_person_ride,
  penalties_food = EXCLUDED.penalties_food,
  penalties_parcel = EXCLUDED.penalties_parcel,
  penalties_person_ride = EXCLUDED.penalties_person_ride,
  total_withdrawn = EXCLUDED.total_withdrawn,
  last_updated_at = EXCLUDED.last_updated_at;

-- =============================================================================
-- 5) WALLET LEDGER – earnings, penalties, onboarding_fee, withdrawal, adjustments
--
-- Schema:
--   - amount is always >= 0 (absolute value); entry_type gives direction (credit/debit).
--   - balance = running balance after this entry. Can be NEGATIVE when:
--       * Penalty applied and rider had low/zero balance
--       * COD (cash on delivery) shortfall or deduction
--       * Other adjustments (reversals, chargebacks, special deductions)
-- Run migration 0062_allow_negative_rider_wallet_balance.sql first so negative balance is allowed.
-- =============================================================================

-- Rider 1003: normal flow – signup bonus, onboarding, earnings, penalty, withdrawal (balance stays >= 0)
INSERT INTO public.wallet_ledger (rider_id, entry_type, amount, balance, service_type, ref, ref_type, description, metadata, created_at)
SELECT v.rider_id, v.entry_type, v.amount, v.balance, v.service_type, v.ref, v.ref_type, v.description, v.metadata::jsonb, v.created_at
FROM (VALUES
  (1003, 'bonus'::wallet_entry_type, 500.00, 500.00, NULL, 'bonus_signup_1003', 'bonus', 'Signup bonus', '{}', NOW() - INTERVAL '12 days'),
  (1003, 'onboarding_fee'::wallet_entry_type, 500.00, 0.00, NULL, 'onbr_ref_1003', 'onboarding_payment', 'Onboarding registration fee', '{"provider":"razorpay"}', NOW() - INTERVAL '11 days'),
  (1003, 'earning'::wallet_entry_type, 400.00, 400.00, 'food', 'ord_food_1003_1', 'order', 'Food delivery earning', '{}', NOW() - INTERVAL '5 days'),
  (1003, 'earning'::wallet_entry_type, 300.00, 700.00, 'parcel', 'ord_parcel_1003_1', 'order', 'Parcel delivery earning', '{}', NOW() - INTERVAL '4 days'),
  (1003, 'earning'::wallet_entry_type, 200.00, 900.00, 'person_ride', 'ord_ride_1003_1', 'order', 'Person ride earning', '{}', NOW() - INTERVAL '3 days'),
  (1003, 'penalty'::wallet_entry_type, 50.00, 850.00, 'food', 'pen_1003_1', 'penalty', 'Late delivery', '{}', NOW() - INTERVAL '2 days'),
  (1003, 'earning'::wallet_entry_type, 800.00, 1650.00, 'food', 'ord_food_1003_2', 'order', 'Food delivery earning', '{}', NOW() - INTERVAL '1 day'),
  (1003, 'earning'::wallet_entry_type, 500.00, 2150.00, 'parcel', 'ord_parcel_1003_2', 'order', 'Parcel delivery earning', '{}', NOW() - INTERVAL '1 day'),
  (1003, 'adjustment'::wallet_entry_type, 600.00, 1550.00, NULL, 'wd_1003_1', 'withdrawal', 'Withdrawal to bank', '{}', NOW() - INTERVAL '2 days'),
  (1003, 'earning'::wallet_entry_type, 800.00, 2350.00, 'food', 'ord_food_1003_3', 'order', 'Food delivery earning', '{}', NOW()),
  (1003, 'earning'::wallet_entry_type, 500.00, 2850.00, 'parcel', 'ord_parcel_1003_3', 'order', 'Parcel delivery earning', '{}', NOW())
) AS v(rider_id, entry_type, amount, balance, service_type, ref, ref_type, description, metadata, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE rider_id = 1003 AND ref = 'ord_food_1003_1');

-- Rider 1006: realistic negative-balance scenario – penalty when balance low, then COD-style adjustment, then recovery
-- Balance goes negative after withdrawal + penalty, then earnings bring it back to positive.
INSERT INTO public.wallet_ledger (rider_id, entry_type, amount, balance, service_type, ref, ref_type, description, metadata, created_at)
SELECT v.rider_id, v.entry_type, v.amount, v.balance, v.service_type, v.ref, v.ref_type, v.description, v.metadata::jsonb, v.created_at
FROM (VALUES
  (1006, 'bonus'::wallet_entry_type, 500.00, 500.00, NULL, 'bonus_signup_1006', 'bonus', 'Signup bonus', '{}', NOW() - INTERVAL '14 days'),
  (1006, 'onboarding_fee'::wallet_entry_type, 500.00, 0.00, NULL, 'onbr_ref_1006', 'onboarding_payment', 'Onboarding registration fee', '{"provider":"razorpay"}', NOW() - INTERVAL '13 days'),
  (1006, 'earning'::wallet_entry_type, 450.00, 450.00, 'food', 'ord_food_1006_1', 'order', 'Food delivery earning', '{}', NOW() - INTERVAL '6 days'),
  (1006, 'earning'::wallet_entry_type, 320.00, 770.00, 'parcel', 'ord_parcel_1006_1', 'order', 'Parcel delivery earning', '{}', NOW() - INTERVAL '5 days'),
  (1006, 'penalty'::wallet_entry_type, 100.00, 670.00, 'parcel', 'pen_1006_1', 'penalty', 'Customer complaint', '{}', NOW() - INTERVAL '4 days'),
  (1006, 'earning'::wallet_entry_type, 450.00, 1120.00, 'food', 'ord_food_1006_2', 'order', 'Food delivery earning', '{}', NOW() - INTERVAL '2 days'),
  (1006, 'earning'::wallet_entry_type, 300.00, 1420.00, 'parcel', 'ord_parcel_1006_2', 'order', 'Parcel delivery earning', '{}', NOW() - INTERVAL '1 day'),
  (1006, 'earning'::wallet_entry_type, 400.00, 1820.00, 'person_ride', 'ord_ride_1006_1', 'order', 'Person ride earning', '{}', NOW() - INTERVAL '1 day'),
  (1006, 'adjustment'::wallet_entry_type, 900.00, 920.00, NULL, 'wd_1006_1', 'withdrawal', 'Withdrawal to bank', '{}', NOW() - INTERVAL '3 days'),
  (1006, 'penalty'::wallet_entry_type, 150.00, 770.00, 'parcel', 'pen_1006_2', 'penalty', 'COD shortfall – cash not deposited', '{}', NOW() - INTERVAL '2 days'),
  (1006, 'adjustment'::wallet_entry_type, 800.00, -30.00, NULL, 'adj_cod_1006_1', 'adjustment', 'COD deduction (order shortfall)', '{"type":"cod_shortfall"}', NOW() - INTERVAL '2 days'),
  (1006, 'earning'::wallet_entry_type, 1950.00, 1920.00, 'food', 'ord_food_1006_3', 'order', 'Food delivery earning', '{}', NOW())
) AS v(rider_id, entry_type, amount, balance, service_type, ref, ref_type, description, metadata, created_at)
WHERE NOT EXISTS (SELECT 1 FROM public.wallet_ledger WHERE rider_id = 1006 AND ref = 'ord_food_1006_1');

-- =============================================================================
-- 6) RIDER PENALTIES – service-wise penalties (food, parcel, person_ride)
-- =============================================================================

INSERT INTO public.rider_penalties (rider_id, service_type, penalty_type, amount, reason, status, order_id, imposed_at, metadata)
SELECT 1003, 'food'::order_type, 'late_delivery', 50.00, 'Order delivered 15 min late', 'paid', NULL, NOW() - INTERVAL '2 days', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.rider_penalties WHERE rider_id = 1003 AND service_type = 'food'::order_type AND penalty_type = 'late_delivery' AND amount = 50);

INSERT INTO public.rider_penalties (rider_id, service_type, penalty_type, amount, reason, status, order_id, imposed_at, metadata)
SELECT 1006, 'parcel'::order_type, 'customer_complaint', 100.00, 'Customer reported damaged package', 'paid', NULL, NOW() - INTERVAL '4 days', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.rider_penalties WHERE rider_id = 1006 AND service_type = 'parcel'::order_type AND penalty_type = 'customer_complaint' AND amount = 100);

INSERT INTO public.rider_penalties (rider_id, service_type, penalty_type, amount, reason, status, order_id, imposed_at, metadata)
SELECT 1006, 'parcel'::order_type, 'other', 150.00, 'COD shortfall – cash not deposited', 'paid', NULL, NOW() - INTERVAL '2 days', '{"type":"cod_shortfall"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.rider_penalties WHERE rider_id = 1006 AND service_type = 'parcel'::order_type AND penalty_type = 'other' AND amount = 150);

-- =============================================================================
-- 7) WITHDRAWAL REQUESTS – pending and completed
-- =============================================================================

INSERT INTO public.withdrawal_requests (
  rider_id,
  amount,
  status,
  bank_acc,
  ifsc,
  account_holder_name,
  upi_id,
  transaction_id,
  processed_at,
  metadata,
  created_at,
  updated_at
)
SELECT 1003, 600.00, 'completed'::withdrawal_status, 'XXXX1234', 'HDFC0001234', 'Amit Patel', NULL, 'txn_wd_1003_001', NOW() - INTERVAL '2 days', '{}'::jsonb, NOW() - INTERVAL '3 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.withdrawal_requests WHERE rider_id = 1003 AND transaction_id = 'txn_wd_1003_001');

INSERT INTO public.withdrawal_requests (
  rider_id,
  amount,
  status,
  bank_acc,
  ifsc,
  account_holder_name,
  upi_id,
  transaction_id,
  processed_at,
  metadata,
  created_at,
  updated_at
)
SELECT 1006, 900.00, 'completed'::withdrawal_status, 'XXXX5678', 'ICIC0005678', 'Rahul Mehta', NULL, 'txn_wd_1006_001', NOW() - INTERVAL '3 days', '{}'::jsonb, NOW() - INTERVAL '4 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.withdrawal_requests WHERE rider_id = 1006 AND transaction_id = 'txn_wd_1006_001');

INSERT INTO public.withdrawal_requests (
  rider_id,
  amount,
  status,
  bank_acc,
  ifsc,
  account_holder_name,
  upi_id,
  transaction_id,
  processed_at,
  metadata,
  created_at,
  updated_at
)
SELECT 1003, 500.00, 'pending'::withdrawal_status, 'XXXX1234', 'HDFC0001234', 'Amit Patel', NULL, NULL, NULL, '{}'::jsonb, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.withdrawal_requests WHERE rider_id = 1003 AND status = 'pending' AND amount = 500);

-- =============================================================================
-- 8) TICKETS – order-related and non-order-related, all services (filterable)
--    order_id NOT NULL = order-related; order_id NULL = non-order-related
-- =============================================================================

INSERT INTO public.tickets (rider_id, order_id, category, priority, subject, message, status, created_at, updated_at)
SELECT 1003, NULL, 'technical', 'medium', 'App crash on order screen', 'App crashes when I open active order. Device: Android 14.', 'open', NOW() - INTERVAL '2 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.tickets WHERE rider_id = 1003 AND subject = 'App crash on order screen' LIMIT 1);

INSERT INTO public.tickets (rider_id, order_id, category, priority, subject, message, status, created_at, updated_at)
SELECT 1003, o.id, 'order', 'high', 'Wrong delivery address', 'Customer says address was wrong for this order.', 'in_progress', NOW() - INTERVAL '1 day', NOW()
FROM (SELECT id FROM public.orders WHERE rider_id = 1003 ORDER BY created_at DESC LIMIT 1) o
WHERE NOT EXISTS (SELECT 1 FROM public.tickets WHERE rider_id = 1003 AND subject = 'Wrong delivery address' LIMIT 1);

INSERT INTO public.tickets (rider_id, order_id, category, priority, subject, message, status, resolution, created_at, updated_at, resolved_at)
SELECT 1003, NULL, 'account', 'low', 'Update bank details', 'Need to update my bank account for withdrawals.', 'resolved', 'Bank details updated via support.', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'
WHERE NOT EXISTS (SELECT 1 FROM public.tickets WHERE rider_id = 1003 AND subject = 'Update bank details' LIMIT 1);

INSERT INTO public.tickets (rider_id, order_id, category, priority, subject, message, status, created_at, updated_at)
SELECT 1006, NULL, 'payment', 'medium', 'Earning not credited', 'Last food order earning not showing in wallet.', 'open', NOW() - INTERVAL '3 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.tickets WHERE rider_id = 1006 AND subject = 'Earning not credited' LIMIT 1);

INSERT INTO public.tickets (rider_id, order_id, category, priority, subject, message, status, created_at, updated_at)
SELECT 1006, NULL, 'technical', 'high', 'GPS not updating', 'GPS stuck during parcel delivery. Had to restart app.', 'open', NOW() - INTERVAL '1 day', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.tickets WHERE rider_id = 1006 AND subject = 'GPS not updating' LIMIT 1);

-- =============================================================================
-- 9) ORDERS – all services (food, parcel, person_ride) for riders 1003 & 1006
--    Minimal rows for filterable list; ensure some order IDs exist for tickets
-- =============================================================================

INSERT INTO public.orders (order_type, rider_id, pickup_address, drop_address, pickup_lat, pickup_lon, drop_lat, drop_lon, fare_amount, rider_earning, status, created_at, updated_at)
SELECT 'food'::order_type, 1003, 'Restaurant A, MG Road', 'Customer Address, Indiranagar', 12.97, 77.60, 12.98, 77.64, 150.00, 80.00, 'delivered', NOW() - INTERVAL '6 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.orders WHERE rider_id = 1003 AND order_type = 'food' AND status = 'delivered' LIMIT 1);

INSERT INTO public.orders (order_type, rider_id, pickup_address, drop_address, pickup_lat, pickup_lon, drop_lat, drop_lon, fare_amount, rider_earning, status, created_at, updated_at)
SELECT 'parcel'::order_type, 1003, 'Warehouse B, Whitefield', 'Office, Koramangala', 12.99, 77.69, 12.93, 77.62, 200.00, 120.00, 'delivered', NOW() - INTERVAL '4 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.orders WHERE rider_id = 1003 AND order_type = 'parcel' LIMIT 1);

INSERT INTO public.orders (order_type, rider_id, pickup_address, drop_address, pickup_lat, pickup_lon, drop_lat, drop_lon, fare_amount, rider_earning, status, created_at, updated_at)
SELECT 'person_ride'::order_type, 1003, 'MG Road', 'Airport Road', 12.97, 77.60, 13.00, 77.70, 250.00, 140.00, 'delivered', NOW() - INTERVAL '3 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.orders WHERE rider_id = 1003 AND order_type = 'person_ride' LIMIT 1);

INSERT INTO public.orders (order_type, rider_id, pickup_address, drop_address, pickup_lat, pickup_lon, drop_lat, drop_lon, fare_amount, rider_earning, status, created_at, updated_at)
SELECT 'food'::order_type, 1006, 'Cafe C, Jayanagar', 'Home, BTM Layout', 12.92, 77.59, 12.91, 77.61, 120.00, 65.00, 'delivered', NOW() - INTERVAL '5 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.orders WHERE rider_id = 1006 AND order_type = 'food' LIMIT 1);

INSERT INTO public.orders (order_type, rider_id, pickup_address, drop_address, pickup_lat, pickup_lon, drop_lat, drop_lon, fare_amount, rider_earning, status, created_at, updated_at)
SELECT 'parcel'::order_type, 1006, 'Shop D, Malleshwaram', 'Address E, Hebbal', 13.00, 77.56, 13.04, 77.59, 180.00, 95.00, 'cancelled', NOW() - INTERVAL '2 days', NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.orders WHERE rider_id = 1006 AND order_type = 'parcel' AND status = 'cancelled' LIMIT 1);

-- Optional: more riders (1004, 1005) with EV + rental path (no DL/RC)
-- UPDATE public.riders SET vehicle_choice = 'EV' WHERE id IN (1004, 1005);
-- Then add rider_vehicles with EV fuel_type; ensure they have rental_proof or ev_proof docs verified.
