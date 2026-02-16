import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const phone = url.searchParams.get('phone') || '';
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 });

  const { data, error } = await supabase
    .from('merchant_parent')
    .select('id, parent_merchant_id, registered_phone')
    .eq('registered_phone', phone)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({}, { status: 404 });
  return NextResponse.json(data);
}



