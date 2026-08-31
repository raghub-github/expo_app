-- Lightweight table for Coredash "Record a GST filing". No backfill.
CREATE TABLE IF NOT EXISTS platform_tax_filings (
  id bigserial PRIMARY KEY,
  tax_type text NOT NULL DEFAULT 'GST',
  period_label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_due numeric(14, 2) NOT NULL DEFAULT 0,
  amount_filed numeric(14, 2) NOT NULL DEFAULT 0,
  filed_at timestamptz,
  reference text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_tax_filings_period_idx
  ON platform_tax_filings (tax_type, period_start DESC);
