-- ============================================================================
-- WITHDRAWAL INVOICE SYSTEM
-- Invoice generated when payout status = COMPLETED (after successful payout).
-- Format: INV-YYYYMMDD-XXXX. One invoice per payout request (unique).
-- ============================================================================

-- withdrawal_invoices: one row per completed payout (idempotent: one invoice per payout_request_id)
CREATE TABLE IF NOT EXISTS public.withdrawal_invoices (
  id BIGSERIAL PRIMARY KEY,
  payout_request_id BIGINT NOT NULL UNIQUE,
  invoice_number TEXT NOT NULL UNIQUE,
  merchant_store_id BIGINT NOT NULL,
  wallet_id BIGINT NOT NULL,

  -- Settlement period (inclusive)
  settlement_from DATE NOT NULL,
  settlement_to DATE NOT NULL,
  approval_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  utr_reference TEXT,

  -- Platform (bill-from)
  platform_name TEXT NOT NULL DEFAULT 'Platform',
  platform_gstin TEXT,
  platform_address TEXT,
  platform_contact_email TEXT,

  -- Merchant (bill-to)
  merchant_legal_name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  merchant_id_display TEXT,
  merchant_gstin TEXT,
  bank_last4 TEXT,

  -- Financial summary (totals)
  gross_order_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  packaging NUMERIC(14, 2) NOT NULL DEFAULT 0,
  addons NUMERIC(14, 2) NOT NULL DEFAULT 0,
  merchant_offers NUMERIC(14, 2) NOT NULL DEFAULT 0,
  refunds NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_order_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  commission NUMERIC(14, 2) NOT NULL DEFAULT 0,
  gst_on_commission NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tds NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tcs NUMERIC(14, 2) NOT NULL DEFAULT 0,
  penalties NUMERIC(14, 2) NOT NULL DEFAULT 0,
  subscription_fees NUMERIC(14, 2) NOT NULL DEFAULT 0,
  adjustments NUMERIC(14, 2) NOT NULL DEFAULT 0,
  final_net_payable NUMERIC(14, 2) NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT withdrawal_invoices_payout_request_id_fkey
    FOREIGN KEY (payout_request_id) REFERENCES public.merchant_payout_requests(id) ON DELETE CASCADE,
  CONSTRAINT withdrawal_invoices_merchant_store_id_fkey
    FOREIGN KEY (merchant_store_id) REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  CONSTRAINT withdrawal_invoices_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES public.merchant_wallet(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS withdrawal_invoices_invoice_number_idx ON public.withdrawal_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS withdrawal_invoices_merchant_store_id_idx ON public.withdrawal_invoices(merchant_store_id);
CREATE INDEX IF NOT EXISTS withdrawal_invoices_completed_at_idx ON public.withdrawal_invoices(completed_at DESC);
COMMENT ON TABLE public.withdrawal_invoices IS 'One invoice per completed payout. Generated when payout status = COMPLETED.';

-- withdrawal_invoice_items: one row per order (detailed breakdown for CSV/PDF)
CREATE TABLE IF NOT EXISTS public.withdrawal_invoice_items (
  id BIGSERIAL PRIMARY KEY,
  withdrawal_invoice_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  order_date TIMESTAMP WITH TIME ZONE NOT NULL,

  gross_order_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  packaging NUMERIC(12, 2) NOT NULL DEFAULT 0,
  addons NUMERIC(12, 2) NOT NULL DEFAULT 0,
  merchant_offer NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_order_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gst_on_commission NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tds NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tcs NUMERIC(12, 2) NOT NULL DEFAULT 0,
  penalty NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_settlement_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT withdrawal_invoice_items_withdrawal_invoice_id_fkey
    FOREIGN KEY (withdrawal_invoice_id) REFERENCES public.withdrawal_invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS withdrawal_invoice_items_withdrawal_invoice_id_idx ON public.withdrawal_invoice_items(withdrawal_invoice_id);
CREATE INDEX IF NOT EXISTS withdrawal_invoice_items_order_id_idx ON public.withdrawal_invoice_items(order_id);
COMMENT ON TABLE public.withdrawal_invoice_items IS 'Per-order line items for withdrawal invoice (CSV detail and PDF breakdown).';

-- Automation: When merchant_payout_requests.status is set to COMPLETED (after successful payout),
-- the application must call ensureWithdrawalInvoice(db, payout_request_id) to create the invoice
-- (idempotent). The merchant download API (GET /api/merchant/invoice/[payoutRequestId]) also
-- creates the invoice on first request if status is COMPLETED.
