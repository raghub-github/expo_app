import { NextResponse } from 'next/server';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

// Diagnostic endpoint — must never be statically evaluated at build time
// (it opens a DB connection). Force dynamic so `next build` skips it.
export const dynamic = 'force-dynamic';

export async function GET() {
  // Extract project ref from DATABASE_URL or use default
  const currentUrl = process.env.DATABASE_URL;
  const projectRef = currentUrl?.match(/postgres\.([^.]+)@/)?.[1] || currentUrl?.match(/@aws-[^-]+-([^.]+)\.pooler/)?.[1] || 'xjtvpdwngewpgvzmwqzt';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!currentUrl) {
    return NextResponse.json({
      success: false,
      error: 'DATABASE_URL not set in environment',
      instructions: [
        '1. Open your .env.local file',
        '2. Add: DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres',
        '3. Get the exact connection string from Supabase Dashboard > Settings > Database'
      ]
    }, { status: 500 });
  }

  // Extract password and test different formats
  const passwordMatch = currentUrl.match(/postgres(?:ql)?:\/\/[^:]+:([^@]+)@/);
  const password = passwordMatch ? passwordMatch[1] : 'YOUR-PASSWORD';

  const formats = [
    {
      name: 'Direct Connection (Current)',
      url: currentUrl,
      description: 'Your current DATABASE_URL'
    },
    {
      name: 'Direct Connection (Port 5432)',
      url: `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`,
      description: 'Standard direct connection'
    },
    {
      name: 'Connection Pooling (Port 6543)',
      url: `postgresql://postgres:${password}@aws-0-${projectRef}.pooler.supabase.com:6543/postgres`,
      description: 'Connection pooling format'
    },
    {
      name: 'Connection Pooling with Project Ref (Port 6543)',
      url: `postgresql://postgres.${projectRef}:${password}@aws-0-${projectRef}.pooler.supabase.com:6543/postgres`,
      description: 'Connection pooling with project ref in username'
    }
  ];

  const results = [];

  // First, test Supabase JS Client (REST API) - this doesn't require direct postgres connection
  if (supabaseUrl && supabaseKey) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('reviews')
        .select('id')
        .limit(1);
      
      if (!error) {
        results.push({
          name: '✅ Supabase JS Client (REST API)',
          url: 'Uses REST API, not direct postgres',
          description: 'This method works! Use Supabase JS client instead of direct postgres connection.',
          success: true,
          message: '✅ WORKING! You can use Supabase JS client for database operations.',
          recommendation: 'Switch to using @supabase/supabase-js instead of direct postgres connection. This uses REST API which is more reliable and doesn\'t require DATABASE_URL.'
        });
        
        // Return immediately if this works
        return NextResponse.json({
          success: true,
          workingFormat: {
            name: 'Supabase JS Client (REST API)',
            method: 'Use @supabase/supabase-js library instead of direct postgres'
          },
          message: '✅ Found working solution: Use Supabase JS Client (REST API)',
          allResults: results,
          nextSteps: [
            'The direct postgres connection is not working due to DNS/hostname issues.',
            'However, Supabase JS Client works perfectly using REST API.',
            'You can continue using your current setup, but you need to:',
            '1. Get the EXACT connection string from Supabase Dashboard > Settings > Database',
            '2. Or switch to using Supabase JS client for all database operations',
            '3. The REST API method is more reliable and doesn\'t require DATABASE_URL'
          ]
        });
      } else {
        results.push({
          name: 'Supabase JS Client (REST API)',
          url: 'Uses REST API',
          description: 'REST API connection test',
          success: false,
          error: error.message,
          code: error.code,
          hint: error.code === 'PGRST116' ? 'Table does not exist - need to create it first' : 'Connection issue'
        });
      }
    } catch (error) {
      results.push({
        name: 'Supabase JS Client (REST API)',
        url: 'Uses REST API',
        description: 'REST API connection test',
        success: false,
        error: error.message
      });
    }
  }

  // Test direct postgres connections
  for (const format of formats) {
    let client = null;
    try {
      client = postgres(format.url, {
        max: 1,
        ssl: 'require',
        connect_timeout: 3
      });
      
      await client`SELECT 1 as test`;
      
      results.push({
        ...format,
        success: true,
        message: 'Connection successful!'
      });
      
      // If one works, return immediately
      return NextResponse.json({
        success: true,
        workingFormat: format,
        message: `Found working connection format: ${format.name}`,
        updateEnv: `DATABASE_URL=${format.url}`,
        allResults: results
      });
    } catch (error) {
      results.push({
        ...format,
        success: false,
        error: error.message,
        hostname: error.cause?.hostname,
        code: error.cause?.code
      });
    } finally {
      // Ensure connection is closed in all cases
      if (client) {
        try {
          await client.end();
        } catch (closeError) {
          // Ignore errors when closing connection
          console.error('Error closing database connection:', closeError);
        }
      }
    }
  }

  // None worked
  return NextResponse.json({
    success: false,
    message: 'None of the connection formats worked',
    currentUrl: currentUrl?.replace(/:[^:@]+@/, ':****@') || 'Not set',
    results: results,
    criticalInstructions: {
      title: '🚨 CRITICAL: You MUST get the EXACT connection string from Supabase Dashboard',
      steps: [
        '1. Go to https://supabase.com/dashboard',
        '2. Select your project',
        '3. Go to Settings > Database',
        '4. Under "Connection string", select "URI" format',
        '5. Copy the connection string EXACTLY as shown (do NOT modify the format)',
        '6. Replace [YOUR-PASSWORD] or password placeholder with your actual database password',
        '7. Update DATABASE_URL in .env.local with the EXACT string from Supabase',
        '8. Restart your dev server (environment variables load at startup)',
        '',
        '⚠️ IMPORTANT:',
        '- The connection string format varies by project region and Supabase version',
        '- Do NOT guess the format - always use the exact string from your dashboard',
        '- If your project is paused, the hostnames won\'t resolve - check project status',
        '- Connection pooling (Supavisor) format is more reliable than direct connection'
      ],
      alternativeSolution: 'If direct postgres continues to fail, consider using Supabase JS Client (@supabase/supabase-js) which uses REST API and doesn\'t require DATABASE_URL. Test this at: /api/db-dns-test'
    }
  }, { status: 500 });
}
