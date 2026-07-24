import { NextResponse } from 'next/server';
import { db } from '../../../../lib/db';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

// Diagnostic endpoint — must never be statically evaluated at build time
// (it opens a DB connection via the lazy `db` proxy). Force dynamic.
export const dynamic = 'force-dynamic';

export async function GET() {
  let client = null;
  try {
    // Get the postgres client directly for raw queries
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.json({
        success: false,
        error: 'DATABASE_URL not configured'
      }, { status: 500 });
    }

    client = postgres(dbUrl, { max: 1, ssl: 'require' });
    
    // Check if table exists
    const result = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'reviews'
      ) as exists;
    `;

    const tableExists = result[0]?.exists || false;

    if (!tableExists) {
      return NextResponse.json({
        success: false,
        tableExists: false,
        message: 'The reviews table does not exist. Please run the migration SQL.',
        migrationSQL: `
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  review VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS email_idx ON reviews(email);
        `.trim(),
        instructions: [
          '1. Go to Supabase Dashboard > SQL Editor',
          '2. Copy and paste the migrationSQL above',
          '3. Click Run',
          '4. Refresh this page to verify'
        ]
      });
    }

    // If table exists, check its structure
    const columns = await client`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'reviews' 
      ORDER BY ordinal_position;
    `;

    return NextResponse.json({
      success: true,
      tableExists: true,
      columns: columns,
      message: 'Database connection successful and reviews table exists!'
    });
  } catch (error) {
    // Enhanced error message for DNS failures
    const isDnsError = error.cause?.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND');
    
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      hostname: error.cause?.hostname,
      message: 'Failed to check database status',
      troubleshooting: isDnsError ? [
        'The database hostname cannot be resolved. This usually means:',
        '1. The connection string format is incorrect',
        '2. The project reference or hostname is wrong',
        '3. The Supabase project might be paused',
        '',
        'SOLUTION: Get the EXACT connection string from Supabase Dashboard:',
        '1. Go to https://supabase.com/dashboard',
        '2. Select your project',
        '3. Go to Settings > Database',
        '4. Under "Connection string", select "URI" format',
        '5. Copy the connection string EXACTLY as shown',
        '6. Replace [YOUR-PASSWORD] with your database password',
        '7. Update DATABASE_URL in .env.local',
        '',
        'You can also test different formats at: /api/db-diagnose'
      ] : [
        '1. Verify DATABASE_URL is set in .env.local',
        '2. Check database connection string format',
        '3. Ensure database is accessible',
        '4. Test connection formats at: /api/db-diagnose'
      ]
    }, { status: 500 });
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

