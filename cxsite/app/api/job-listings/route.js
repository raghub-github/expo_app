import { NextResponse } from 'next/server';
import supabase from '@/lib/supabase';

export async function GET() {
  // Fetch job listings from the public.job_listings table
  const { data, error } = await supabase
    .from('job_listings')
    .select('*')
    .eq('status', 'Open')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
