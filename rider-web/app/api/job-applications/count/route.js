import { db } from '@/lib/db';
import { jobApplications } from '@/lib/drizzleSchema';
import { eq, sql } from 'drizzle-orm';

export const revalidate = 0; // Disable caching to always fetch fresh data

export async function GET(req) {
  try {
    // Get all job applications grouped by job_id with count
    const applicationCounts = await db
      .select({
        job_id: jobApplications.job_id,
        count: sql`COUNT(*)`
      })
      .from(jobApplications)
      .groupBy(jobApplications.job_id);

    // Convert to object for easier lookup
    const countsMap = {};
    applicationCounts.forEach(item => {
      countsMap[item.job_id] = parseInt(item.count) || 0;
    });

    return new Response(
      JSON.stringify(countsMap),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        } 
      }
    );
  } catch (error) {
    console.error('Error fetching application counts:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch application counts', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
