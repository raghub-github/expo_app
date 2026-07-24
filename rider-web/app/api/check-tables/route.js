import { NextResponse } from 'next/server';
import postgres from 'postgres';

// Diagnostic endpoint — must never be statically evaluated at build time
// (it opens a DB connection). Force dynamic so `next build` skips it.
export const dynamic = 'force-dynamic';

export async function GET() {
  let client = null;
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.json({
        success: false,
        error: 'DATABASE_URL not configured'
      }, { status: 500 });
    }

    client = postgres(dbUrl, { max: 1, ssl: 'require' });
    
    // Check both tables
    const reviewsCheck = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'reviews'
      ) as exists;
    `;

    const registrationsCheck = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'registrations'
      ) as exists;
    `;

    const reviewsExists = reviewsCheck[0]?.exists || false;
    const registrationsExists = registrationsCheck[0]?.exists || false;

    return NextResponse.json({
      success: true,
      tables: {
        reviews: {
          exists: reviewsExists,
          migrationSQL: reviewsExists ? null : `
CREATE TABLE IF NOT EXISTS gatimitra_reviews (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
  review VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS email_idx ON gatimitra_reviews(email);
          `.trim()
        },
        registrations: {
          exists: registrationsExists,
          migrationSQL: registrationsExists ? null : `
CREATE TABLE IF NOT EXISTS gatimitra_registrations (
  id SERIAL PRIMARY KEY,
  rider_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  location VARCHAR(500) NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL
);

CREATE INDEX IF NOT EXISTS registrations_email_idx ON gatimitra_registrations(email);
CREATE INDEX IF NOT EXISTS registrations_status_idx ON gatimitra_registrations(status);
CREATE INDEX IF NOT EXISTS registrations_created_at_idx ON gatimitra_registrations(created_at DESC);
          `.trim()
        }
      },
      message: reviewsExists && registrationsExists 
        ? '✅ Both tables exist!'
        : '⚠️ Some tables are missing. Use the migrationSQL above to create them.'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code
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

