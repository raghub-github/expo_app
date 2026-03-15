-- ============================================================================
-- UNIFIED ORDERS PAYMENTS AND REFUNDS
-- Production-Grade Payment System
-- Supports multiple payment attempts and partial/full refunds
-- Migration: unified_orders_payments
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Multiple Payment Attempts: One order can have multiple payment attempts
-- - Payment Gateway Integration: Stores all gateway-specific IDs and responses
-- - Refund Tracking: Partial and full refunds tracked separately
-- - Merchant Debit Support: Tracks amounts debited from merchants
-- ============================================================================

-- ============================================================================
-- ENSURE ENUMS EXIST
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status_type') THEN
    CREATE TYPE payment_status_type AS ENUM (
      'pending',
      'processing',
      'completed',
      'failed',
      'refunded',
      'partially_refunded',
      'cancelled'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_mode_type') THEN
    CREATE TYPE payment_mode_type AS ENUM (
      'cash',
      'online',
      'wallet',
      'upi',
      'card',
      'netbanking',
      'cod',
      'other'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_type') THEN
    CREATE TYPE refund_type AS ENUM (
      'full',
      'partial',
      'item',
      'delivery_fee',
      'tip',
      'penalty'
    );
  END IF;
END $$;

-- ============================================================================
-- ORDER PAYMENTS (Multiple Payment Attempts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- PAYMENT ATTEMPT INFORMATION
  -- ==========================================================================
  payment_attempt_no INTEGER NOT NULL DEFAULT 1 CHECK (payment_attempt_no > 0),
  payment_source TEXT, -- 'customer_app', 'merchant_app', 'web', 'api'
  payment_mode payment_mode_type NOT NULL,
  
  -- ==========================================================================
  -- TRANSACTION IDs
  -- ==========================================================================
  transaction_id TEXT UNIQUE, -- Internal transaction ID
  mp_transaction_id TEXT, -- Marketplace transaction ID
  pg_transaction_id TEXT, -- Payment gateway transaction ID
  
  -- ==========================================================================
  -- PAYMENT GATEWAY DETAILS
  -- ==========================================================================
  pg_name TEXT, -- 'razorpay', 'stripe', 'payu', 'phonepe', etc.
  pg_order_id TEXT,
  pg_payment_id TEXT,
  pg_signature TEXT,
  
  -- ==========================================================================
  -- PAYMENT STATUS & AMOUNT
  -- ==========================================================================
  payment_status payment_status_type NOT NULL DEFAULT 'pending',
  payment_amount NUMERIC(12, 2) NOT NULL CHECK (payment_amount > 0),
  payment_fee NUMERIC(10, 2) DEFAULT 0, -- Payment gateway fee
  net_amount NUMERIC(12, 2), -- Net amount after fees
  
  -- ==========================================================================
  -- COUPON DETAILS
  -- ==========================================================================
  coupon_code TEXT,
  coupon_type TEXT, -- 'percentage', 'fixed', 'free_delivery'
  coupon_value NUMERIC(10, 2),
  coupon_max_discount NUMERIC(10, 2),
  coupon_discount_applied NUMERIC(10, 2) DEFAULT 0,
  
  -- ==========================================================================
  -- REFUND TRACKING
  -- ==========================================================================
  is_refunded BOOLEAN DEFAULT FALSE,
  refunded_amount NUMERIC(12, 2) DEFAULT 0,
  refund_transaction_id TEXT,
  
  -- ==========================================================================
  -- PAYMENT RESPONSE
  -- ==========================================================================
  pg_response JSONB DEFAULT '{}', -- Gateway response (full payload)
  payment_metadata JSONB DEFAULT '{}', -- Additional payment metadata
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  -- ==========================================================================
  -- CONSTRAINTS
  -- ==========================================================================
  UNIQUE(order_id, payment_attempt_no) -- Ensure sequential attempts
);

-- Indexes for order_payments
CREATE INDEX IF NOT EXISTS order_payments_order_id_idx ON public.order_payments(order_id);
CREATE INDEX IF NOT EXISTS order_payments_transaction_id_idx ON public.order_payments(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_mp_transaction_id_idx ON public.order_payments(mp_transaction_id) WHERE mp_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_pg_transaction_id_idx ON public.order_payments(pg_transaction_id) WHERE pg_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_pg_payment_id_idx ON public.order_payments(pg_payment_id) WHERE pg_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_payment_status_idx ON public.order_payments(payment_status);
CREATE INDEX IF NOT EXISTS order_payments_payment_mode_idx ON public.order_payments(payment_mode);
CREATE INDEX IF NOT EXISTS order_payments_pg_name_idx ON public.order_payments(pg_name) WHERE pg_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_payments_created_at_idx ON public.order_payments(created_at);
CREATE INDEX IF NOT EXISTS order_payments_is_refunded_idx ON public.order_payments(is_refunded) WHERE is_refunded = TRUE;

-- Comments
COMMENT ON TABLE public.order_payments IS 'Payment attempts for orders. Multiple payment attempts per order are supported. Tracks payment gateway transactions, coupons, and refunds.';
COMMENT ON COLUMN public.order_payments.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_payments.payment_attempt_no IS 'Attempt number (1, 2, 3, etc.). Sequential attempts for same order.';
COMMENT ON COLUMN public.order_payments.payment_source IS 'Source of payment: customer_app, merchant_app, web, api.';
COMMENT ON COLUMN public.order_payments.payment_mode IS 'Payment mode: cash, online, wallet, upi, card, netbanking, cod, other.';
COMMENT ON COLUMN public.order_payments.transaction_id IS 'Internal transaction ID (unique).';
COMMENT ON COLUMN public.order_payments.mp_transaction_id IS 'Marketplace transaction ID.';
COMMENT ON COLUMN public.order_payments.pg_transaction_id IS 'Payment gateway transaction ID.';
COMMENT ON COLUMN public.order_payments.pg_name IS 'Payment gateway name: razorpay, stripe, payu, phonepe, etc.';
COMMENT ON COLUMN public.order_payments.pg_order_id IS 'Payment gateway order ID.';
COMMENT ON COLUMN public.order_payments.pg_payment_id IS 'Payment gateway payment ID.';
COMMENT ON COLUMN public.order_payments.payment_status IS 'Payment status: pending, processing, completed, failed, refunded, partially_refunded, cancelled.';
COMMENT ON COLUMN public.order_payments.payment_amount IS 'Payment amount (before fees).';
COMMENT ON COLUMN public.order_payments.payment_fee IS 'Payment gateway fee.';
COMMENT ON COLUMN public.order_payments.net_amount IS 'Net amount after fees (payment_amount - payment_fee).';
COMMENT ON COLUMN public.order_payments.coupon_code IS 'Coupon code used (if any).';
COMMENT ON COLUMN public.order_payments.coupon_discount_applied IS 'Discount amount applied from coupon.';
COMMENT ON COLUMN public.order_payments.is_refunded IS 'Whether this payment was refunded.';
COMMENT ON COLUMN public.order_payments.refunded_amount IS 'Amount refunded from this payment.';
COMMENT ON COLUMN public.order_payments.pg_response IS 'Full payment gateway response (stored as JSONB for flexibility).';

-- ============================================================================
-- ORDER REFUNDS (Partial and Full Refunds)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_refunds (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_payment_id BIGINT REFERENCES public.order_payments(id) ON DELETE SET NULL,
  
  -- ==========================================================================
  -- REFUND TYPE & DETAILS
  -- ==========================================================================
  refund_type refund_type NOT NULL,
  refund_reason TEXT NOT NULL,
  refund_description TEXT,
  
  -- ==========================================================================
  -- REFUND IDs
  -- ==========================================================================
  redemption_id TEXT,
  refund_id TEXT UNIQUE, -- Unique refund ID
  pg_transaction_id TEXT, -- Payment gateway transaction ID
  pg_refund_id TEXT, -- Payment gateway refund ID
  
  -- ==========================================================================
  -- REFUND DETAILS
  -- ==========================================================================
  product_type TEXT, -- 'order', 'item', 'delivery_fee', 'tip', 'penalty'
  refund_amount NUMERIC(12, 2) NOT NULL CHECK (refund_amount > 0),
  refund_fee NUMERIC(10, 2) DEFAULT 0, -- Refund processing fee
  net_refund_amount NUMERIC(12, 2), -- Net refund after fees
  
  -- ==========================================================================
  -- COUPON ISSUANCE (As Refund)
  -- ==========================================================================
  issued_coupon_code TEXT,
  issued_coupon_value NUMERIC(10, 2),
  issued_coupon_expiry TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- MERCHANT DEBIT
  -- ==========================================================================
  mx_debit_amount NUMERIC(12, 2) DEFAULT 0, -- Amount debited from merchant
  mx_debit_reason TEXT, -- Reason for merchant debit
  
  -- ==========================================================================
  -- REFUND STATUS & PROCESSING
  -- ==========================================================================
  refund_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  refund_initiated_by TEXT, -- 'customer', 'merchant', 'rider', 'agent', 'system'
  refund_initiated_by_id BIGINT,
  refund_processed_by TEXT,
  refund_processed_by_id BIGINT,
  
  -- ==========================================================================
  -- REFUND RESPONSE
  -- ==========================================================================
  pg_refund_response JSONB DEFAULT '{}', -- Gateway refund response
  refund_metadata JSONB DEFAULT '{}', -- Additional refund metadata
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for order_refunds
CREATE INDEX IF NOT EXISTS order_refunds_order_id_idx ON public.order_refunds(order_id);
CREATE INDEX IF NOT EXISTS order_refunds_order_payment_id_idx ON public.order_refunds(order_payment_id) WHERE order_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_refund_id_idx ON public.order_refunds(refund_id) WHERE refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_pg_refund_id_idx ON public.order_refunds(pg_refund_id) WHERE pg_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_refund_status_idx ON public.order_refunds(refund_status);
CREATE INDEX IF NOT EXISTS order_refunds_refund_type_idx ON public.order_refunds(refund_type);
CREATE INDEX IF NOT EXISTS order_refunds_refund_initiated_by_idx ON public.order_refunds(refund_initiated_by) WHERE refund_initiated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_refunds_created_at_idx ON public.order_refunds(created_at);
CREATE INDEX IF NOT EXISTS order_refunds_product_type_idx ON public.order_refunds(product_type) WHERE product_type IS NOT NULL;

-- Comments
COMMENT ON TABLE public.order_refunds IS 'Refunds for orders. Supports partial and full refunds. Tracks refund reasons, gateway transactions, coupon issuance, and merchant debits.';
COMMENT ON COLUMN public.order_refunds.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_refunds.order_payment_id IS 'Foreign key to order_payments table (which payment was refunded).';
COMMENT ON COLUMN public.order_refunds.refund_type IS 'Type of refund: full, partial, item, delivery_fee, tip, penalty.';
COMMENT ON COLUMN public.order_refunds.refund_reason IS 'Reason for refund (required).';
COMMENT ON COLUMN public.order_refunds.refund_description IS 'Detailed description of refund reason.';
COMMENT ON COLUMN public.order_refunds.refund_id IS 'Unique refund ID.';
COMMENT ON COLUMN public.order_refunds.pg_refund_id IS 'Payment gateway refund ID.';
COMMENT ON COLUMN public.order_refunds.product_type IS 'What is being refunded: order, item, delivery_fee, tip, penalty.';
COMMENT ON COLUMN public.order_refunds.refund_amount IS 'Refund amount (before fees).';
COMMENT ON COLUMN public.order_refunds.refund_fee IS 'Refund processing fee.';
COMMENT ON COLUMN public.order_refunds.net_refund_amount IS 'Net refund after fees (refund_amount - refund_fee).';
COMMENT ON COLUMN public.order_refunds.issued_coupon_code IS 'Coupon code issued as refund (if refunded as coupon instead of cash).';
COMMENT ON COLUMN public.order_refunds.issued_coupon_value IS 'Value of coupon issued.';
COMMENT ON COLUMN public.order_refunds.mx_debit_amount IS 'Amount debited from merchant (if merchant is responsible for refund).';
COMMENT ON COLUMN public.order_refunds.mx_debit_reason IS 'Reason for merchant debit.';
COMMENT ON COLUMN public.order_refunds.refund_status IS 'Refund status: pending, processing, completed, failed.';
COMMENT ON COLUMN public.order_refunds.refund_initiated_by IS 'Who initiated the refund: customer, merchant, rider, agent, system.';
COMMENT ON COLUMN public.order_refunds.refund_processed_by IS 'Who processed the refund (usually finance team or system).';
COMMENT ON COLUMN public.order_refunds.pg_refund_response IS 'Full payment gateway refund response (stored as JSONB).';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update order_payments updated_at
DROP TRIGGER IF EXISTS order_payments_updated_at_trigger ON public.order_payments;
CREATE TRIGGER order_payments_updated_at_trigger
  BEFORE UPDATE ON public.order_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_refunds ENABLE ROW LEVEL SECURITY;
