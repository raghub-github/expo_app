-- Enable read access for all users on merchant_store_documents
CREATE POLICY "Allow all read access"
  ON public.merchant_store_documents
  FOR SELECT
  USING (true);
