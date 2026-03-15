// Next.js API route for updating merchant_store_documents status
import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { id, is_verified, rejection_reason } = req.body;
  if (!id || typeof is_verified !== 'boolean') {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const update: any = {
    is_verified,
    updated_at: new Date().toISOString(),
  };
  if (is_verified) {
    update.verified_at = new Date().toISOString();
    update.verified_by = 'ADMIN';
    update.rejection_reason = null;
  } else if (rejection_reason) {
    update.rejection_reason = rejection_reason;
    update.verified_at = null;
    update.verified_by = null;
  }
  const { error } = await supabase
    .from('merchant_store_documents')
    .update(update)
    .eq('id', id);
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ success: true });
}
