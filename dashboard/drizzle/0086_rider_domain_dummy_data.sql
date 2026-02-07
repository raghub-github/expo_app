-- ============================================================================
-- RIDER DOMAIN DUMMY DATA (Realistic seed for all rider-related tables)
-- Migration: 0086_rider_domain_dummy_data.sql
--
-- Run after: 0085_rider_onboarding_system_redesign.sql (and rider/order migrations)
-- Idempotent: uses ON CONFLICT / WHERE NOT EXISTS where applicable.
-- ============================================================================

-- KEY FIX: INSERT...SELECT must have ONE WHERE clause. Use AND NOT EXISTS(...), not a second WHERE.
-- Wrong:  FROM riders WHERE mobile = 'X' WHERE NOT EXISTS (...)
-- Right:  FROM riders WHERE mobile = 'X' AND NOT EXISTS (...)

-- 11. WITHDRAWAL REQUESTS (corrected)
INSERT INTO withdrawal_requests (rider_id, amount, status, bank_acc, ifsc, account_holder_name, upi_id, transaction_id, failure_reason, processed_at, created_at, updated_at)
SELECT id, 1000.00, 'completed', 'XXXX1234', 'HDFC0000123', name, NULL, 'TXN' || id || '001', NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '12 days', NOW()
FROM riders
WHERE mobile = '8765401001'
AND NOT EXISTS (SELECT 1 FROM withdrawal_requests w WHERE w.rider_id = riders.id AND amount = 1000 LIMIT 1);

INSERT INTO withdrawal_requests (rider_id, amount, status, bank_acc, ifsc, account_holder_name, created_at, updated_at)
SELECT id, 750.00, 'pending', 'YYYY5678', 'SBIN0000456', name, NOW() - INTERVAL '1 day', NOW()
FROM riders
WHERE mobile = '8765401002'
AND NOT EXISTS (SELECT 1 FROM withdrawal_requests w WHERE w.rider_id = riders.id AND status = 'pending' LIMIT 1);

INSERT INTO withdrawal_requests (rider_id, amount, status, bank_acc, ifsc, account_holder_name, failure_reason, created_at, updated_at)
SELECT id, 500.00, 'failed', 'ZZZZ9012', 'ICIC0000789', name, 'Insufficient balance', NOW() - INTERVAL '3 days', NOW()
FROM riders
WHERE mobile = '8765401006'
AND NOT EXISTS (SELECT 1 FROM withdrawal_requests w WHERE w.rider_id = riders.id AND status = 'failed' LIMIT 1);

-- 13. RIDER PENALTIES (corrected — use AND NOT EXISTS)
INSERT INTO rider_penalties (rider_id, service_type, penalty_type, amount, reason, status, source, imposed_at, metadata)
SELECT id, 'food', 'late_delivery', 50.00, 'Order #F-1001 delivered 25 min late', 'active', 'system', NOW() - INTERVAL '15 days', '{}'
FROM riders
WHERE mobile = '8765401001'
AND NOT EXISTS (SELECT 1 FROM rider_penalties p WHERE p.rider_id = riders.id AND penalty_type = 'late_delivery' LIMIT 1);

INSERT INTO rider_penalties (rider_id, service_type, penalty_type, amount, reason, status, source, imposed_at, resolution_notes)
SELECT id, 'parcel', 'customer_complaint', 30.00, 'Parcel packaging damaged', 'reversed', 'agent', NOW() - INTERVAL '20 days', 'Reverted after verification'
FROM riders
WHERE mobile = '8765401001'
AND NOT EXISTS (SELECT 1 FROM rider_penalties p WHERE p.rider_id = riders.id AND penalty_type = 'customer_complaint' LIMIT 1);

-- 14. TICKETS (corrected — use AND NOT EXISTS)
INSERT INTO tickets (rider_id, category, priority, subject, message, status, resolution, created_at, updated_at, resolved_at)
SELECT id, 'EARNINGS_NOT_CREDITED', 'medium', 'Earning not credited for order', 'Order #F-2001 completed but earning not reflected in wallet.', 'resolved', 'Credited manually after verification', NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days'
FROM riders
WHERE mobile = '8765401002'
AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.rider_id = riders.id AND subject LIKE 'Earning not credited%' LIMIT 1);

INSERT INTO tickets (rider_id, category, priority, subject, message, status, created_at, updated_at)
SELECT id, 'DOCUMENT_VERIFICATION_ISSUE', 'high', 'DL verification pending', 'Uploaded DL 5 days ago, still showing pending.', 'open', NOW() - INTERVAL '2 days', NOW()
FROM riders
WHERE mobile = '8765401004'
AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.rider_id = riders.id AND subject LIKE 'DL verification%' LIMIT 1);

-- 16. ONBOARDING STATUS TRANSITIONS (corrected — use AND NOT EXISTS)
INSERT INTO onboarding_status_transitions (rider_id, from_stage, to_stage, from_kyc, to_kyc, from_status, to_status, trigger_type, trigger_ref_id, created_at)
SELECT id, 'KYC', 'PAYMENT', 'PENDING', 'APPROVED', 'INACTIVE', 'INACTIVE', 'document_verification', (SELECT id FROM rider_documents WHERE rider_id = riders.id AND doc_type = 'aadhaar' ORDER BY created_at DESC LIMIT 1), NOW() - INTERVAL '28 days'
FROM riders
WHERE mobile = '8765401001'
AND NOT EXISTS (SELECT 1 FROM onboarding_status_transitions o WHERE o.rider_id = riders.id AND to_stage = 'PAYMENT' LIMIT 1);

INSERT INTO onboarding_status_transitions (rider_id, from_stage, to_stage, from_kyc, to_kyc, trigger_type, created_at)
SELECT id, 'PAYMENT', 'ACTIVE', NULL, NULL, 'payment_verified', NOW() - INTERVAL '85 days'
FROM riders
WHERE mobile = '8765401001'
AND NOT EXISTS (SELECT 1 FROM onboarding_status_transitions o WHERE o.rider_id = riders.id AND to_stage = 'ACTIVE' LIMIT 1);
