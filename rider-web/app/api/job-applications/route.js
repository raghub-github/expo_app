import { db } from '@/lib/db';
import { jobApplications } from '@/lib/drizzleSchema';
import { eq } from 'drizzle-orm';

export async function POST(req) {
  try {
    const body = await req.json();

    // Validate required fields
    const requiredFields = ['job_id', 'full_name', 'email', 'phone', 'resume_url'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return new Response(
          JSON.stringify({ error: `${field} is required` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Insert application into the database
    const result = await db.insert(jobApplications).values({
      job_id: body.job_id,
      full_name: body.full_name,
      email: body.email,
      phone: body.phone,
      city: body.city || null,
      state: body.state || null,
      experience_years: body.experience_years || null,
      current_company: body.current_company || null,
      expected_salary: body.expected_salary || null,
      notice_period: body.notice_period || null,
      portfolio_url: body.portfolio_url || null,
      linkedin_url: body.linkedin_url || null,
      github_url: body.github_url || null,
      resume_url: body.resume_url, // Now stores the signed URL from R2
      cover_letter: body.cover_letter || null,
    });

    return new Response(
      JSON.stringify({ 
        message: 'Application submitted successfully! We will contact you soon.',
        result 
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error submitting application:', error);
    
    // Handle duplicate key constraint error
    if (error.code === '23505' && error.constraint_name === 'unique_job_application') {
      return new Response(
        JSON.stringify({ error: 'You have already applied to this job position. Please check your email for updates.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ error: 'Failed to submit application', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}