import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const parentId = url.searchParams.get('parent_id') || '';
  if (!parentId) return NextResponse.json({ error: 'parent_id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('merchant_parents')
    .select('parent_merchant_id, parent_name')
    .eq('parent_merchant_id', parentId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({}, { status: 404 });
  return NextResponse.json(data);
}
