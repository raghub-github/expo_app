import { supabase } from './supabase';

// In your withdrawals.ts file
export interface Withdrawal {
  id: string;
  store_id: string;
  store_name: string;
  parent_merchant_id: string;
  parent_merchant: string;
  amount: number;
  request_date: string;
  date?: string; // For backward compatibility
  transaction_id: string;
  transaction?: string; // For backward compatibility
  status: 'pending' | 'approved' | 'rejected';
  bank_details?: {
    account_holder: string;
    account_number: string;
    bank_name: string;
    ifsc_code: string;
  };
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export const fetchAllWithdrawals = async (from?: string, to?: string): Promise<Withdrawal[]> => {
  try {
    let url = '/api/withdrawals';
    if (from || to) {
      const params = new URLSearchParams();
      if (from) params.append('from', from);
      if (to) params.append('to', to);
      url += `?${params.toString()}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch withdrawals');
    const data = await res.json();
    return data || [];
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    return [];
  }
};

export const updateWithdrawalStatus = async (
  id: string,
  status: 'approved' | 'rejected',
  transaction?: string,
  rejection_reason?: string
): Promise<boolean> => {
  const { error } = await supabase
    .from('withdrawals')
    .update({ status, transaction, rejection_reason })
    .eq('id', id);
  if (error) {
    console.error('Error updating withdrawal:', error);
    return false;
  }
  return true;
};
