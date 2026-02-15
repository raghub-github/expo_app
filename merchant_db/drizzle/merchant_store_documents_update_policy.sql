-- Allow all users to update merchant_store_documents (for demo/dev, restrict as needed in prod)
CREATE POLICY "Allow all update access"
  ON public.merchant_store_documents
  FOR UPDATE
  USING (true);
