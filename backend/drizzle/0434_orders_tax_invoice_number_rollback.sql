-- Rollback 0434 · drop the trigger/function/index/column (assigned numbers are lost).
DROP TRIGGER IF EXISTS trg_orders_tax_invoice_number ON orders_core;
DROP FUNCTION IF EXISTS assign_orders_tax_invoice_number();
DROP INDEX IF EXISTS orders_core_tax_invoice_number_uq;
ALTER TABLE orders_core DROP COLUMN IF EXISTS tax_invoice_number;
DROP FUNCTION IF EXISTS gm_financial_year(timestamptz);
DROP SEQUENCE IF EXISTS orders_tax_invoice_seq;
