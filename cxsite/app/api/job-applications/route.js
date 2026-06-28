import { NextResponse } from 'next/server';
import supabase from '@/lib/supabase';

// POST: Save job application data to Supabase after resume is uploaded to R2 and signed URL is generated
export async function POST(req) {
  try {
    const body = await req.json();
    // Destructure all fields from the request body
    const {
      job_id,
      full_name,
      email,
      phone,
      city,
      state,
      experience_years,
      current_company,
      expected_salary,
      notice_period,
      portfolio_url,
      linkedin_url,
      github_url,
      resume_url, // This should be the signed URL from R2
      cover_letter
    } = body;

    // Insert into job_applications table
    const { data, error } = await supabase
      .from('job_applications')
      .insert([
        {
          job_id,
          full_name,
          email,
          phone,
          city,
          state,
          experience_years,
          current_company,
          expected_salary,
          notice_period,
          portfolio_url,
          linkedin_url,
          github_url,
          resume_url,
          cover_letter
        }
      ]);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Application submitted successfully!', data });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
