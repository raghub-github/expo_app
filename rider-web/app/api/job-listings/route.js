// app/api/job-listings/route.js
import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { jobListings } from '@/lib/drizzleSchema';

export const revalidate = 0; // Disable caching to always fetch fresh data

export async function GET(req) {
  try {
    const rows = await db.select()
      .from(jobListings)
      .where(eq(jobListings.status, 'Open'))
      .orderBy(jobListings.created_at, 'desc');

    // Format salary to ensure it's in INR format
    const formattedRows = rows.map(row => ({
      ...row,
      salary: row.salary?.includes('₹') ? row.salary : `₹ ${row.salary || ''}`
    }));

    return new Response(JSON.stringify(formattedRows), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });
  } catch (error) {
    console.error('Error fetching job listings:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch job listings. Please check the server logs for more details.',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}