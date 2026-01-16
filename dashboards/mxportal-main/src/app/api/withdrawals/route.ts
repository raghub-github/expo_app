import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabase
    .from('withdrawals')
    .select('*')
    .order('request_date', { ascending: false });

  if (from) {
    query = query.gte('request_date', from);
  }
  if (to) {
    query = query.lte('request_date', to);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
