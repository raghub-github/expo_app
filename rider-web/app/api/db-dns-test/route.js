import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Diagnostic endpoint — must never be statically evaluated at build time
// (it performs DNS/network lookups). Force dynamic so `next build` skips it.
export const dynamic = 'force-dynamic';

export async function GET() {
  // Extract project ref from Supabase URL
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'xjtvpdwngewpgvzmwqzt';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const results = {
    projectUrl: supabaseUrl,
    projectRef: projectRef,
    tests: []
  };

  // Test 1: Check if Supabase API URL is accessible
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Try to query the database using Supabase JS client (uses REST API, not direct postgres)
      const { data, error } = await supabase
        .from('reviews')
        .select('id')
        .limit(1);
      
      if (error) {
        results.tests.push({
          name: 'Supabase JS Client (REST API)',
          success: false,
          error: error.message,
          code: error.code,
          hint: error.code === 'PGRST116' ? 'Table does not exist - need to create it' : 'Connection or table issue'
        });
      } else {
        results.tests.push({
          name: 'Supabase JS Client (REST API)',
          success: true,
          message: '✅ Supabase REST API connection works! You can use this instead of direct postgres.',
          data: data
        });
      }
    } catch (error) {
      results.tests.push({
        name: 'Supabase JS Client (REST API)',
        success: false,
        error: error.message
      });
    }
  } else {
    results.tests.push({
      name: 'Supabase JS Client (REST API)',
      success: false,
      error: 'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set'
    });
  }

  // Test 2: Try DNS lookup for different hostname formats
  const hostnames = [
    `db.${projectRef}.supabase.co`,
    `aws-0-${projectRef}.pooler.supabase.com`,
    `${supabaseUrl?.replace('https://', '').replace('.supabase.co', '')}.supabase.co`
  ];

  for (const hostname of hostnames) {
    try {
      // Try to fetch from the hostname (this will test DNS resolution)
      const testUrl = `https://${hostname}`;
      const response = await fetch(testUrl, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(3000)
      });
      
      results.tests.push({
        name: `DNS Test: ${hostname}`,
        success: true,
        message: `Hostname resolves (HTTP ${response.status})`
      });
    } catch (error) {
      results.tests.push({
        name: `DNS Test: ${hostname}`,
        success: false,
        error: error.message,
        code: error.cause?.code,
        hint: error.cause?.code === 'ENOTFOUND' ? 'Hostname does not exist - project might be paused or hostname format is wrong' : 'Network/DNS issue'
      });
    }
  }

  const hasWorkingSolution = results.tests.some(t => t.success && t.name.includes('Supabase JS Client'));

  return NextResponse.json({
    success: hasWorkingSolution,
    message: hasWorkingSolution 
      ? '✅ Found working solution: Use Supabase JS Client instead of direct postgres connection'
      : '❌ All connection methods failed',
    results: results,
    recommendation: hasWorkingSolution
      ? 'Switch to using Supabase JS Client (@supabase/supabase-js) for database operations instead of direct postgres connection. This uses REST API which is more reliable.'
      : 'Please check: 1) Is your Supabase project active (not paused)? 2) Get the exact connection string from Supabase Dashboard > Settings > Database'
  });
}

