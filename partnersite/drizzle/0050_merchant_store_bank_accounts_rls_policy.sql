-- Enable read access for all users on merchant_store_bank_accounts
-- This allows anyone to read bank account details

-- Drop existing policy if exists
DROP POLICY IF EXISTS "Allow all read access" ON public.merchant_store_bank_accounts;

-- Create read policy - anyone can read
CREATE POLICY "Allow all read access"
  ON public.merchant_store_bank_accounts
  FOR SELECT
  USING (true);

-- Enable RLS if not already enabled
ALTER TABLE public.merchant_store_bank_accounts ENABLE ROW LEVEL SECURITY;
