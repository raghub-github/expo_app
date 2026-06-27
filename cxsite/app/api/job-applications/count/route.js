import { NextResponse } from 'next/server';
import supabase from '@/lib/supabase';

// Disable all caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    // Get request URL and add cache-busting parameter
    const url = new URL(request.url);
    const cacheBuster = url.searchParams.get('cb') || Date.now();
    
    console.log(`[${new Date().toISOString()}] Fetching application counts, cacheBuster: ${cacheBuster}`);

    // Query Supabase
    const { data, error } = await supabase
      .from('job_applications')
      .select('job_id')
      .not('job_id', 'is', null);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { 
          error: error.message,
          timestamp: new Date().toISOString()
        }, 
        { status: 400 }
      );
    }

    // Count applications per job_id
    const counts = {};
    if (data && Array.isArray(data)) {
      data.forEach(row => {
        if (row.job_id) {
          counts[row.job_id] = (counts[row.job_id] || 0) + 1;
        }
      });
    }

    // Prepare response with no-cache headers
    const response = NextResponse.json({
      success: true,
      counts,
      totalApplications: data?.length || 0,
      timestamp: new Date().toISOString(),
      cacheBuster
    });

    // Set headers to prevent caching
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    response.headers.set('X-Content-Type-Options', 'nosniff');

    return response;
  } catch (err) {
    console.error('API error:', err);
    return NextResponse.json(
      { 
        error: err.message || 'Internal server error',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    );
  }
}