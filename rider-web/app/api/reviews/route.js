import { NextResponse } from 'next/server';
import { db } from '../../../lib/db';
import { reviews } from '../../../lib/drizzleSchema';
import { eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';

export async function GET(req) {
  try {
    // Get query parameters for pagination
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');
    const limit = limitParam ? parseInt(limitParam) : null;
    const offset = offsetParam ? parseInt(offsetParam) : 0;

    let allReviews;

    if (limit) {
      allReviews = await db
        .select()
        .from(reviews)
        .orderBy(desc(reviews.created_at))
        .limit(limit)
        .offset(offset);
    } else {
      allReviews = await db
        .select()
        .from(reviews)
        .orderBy(desc(reviews.created_at));
    }

    // Ensure response fields are included
    allReviews = allReviews.map(review => ({
      ...review,
      hasResponse: review.response_by && review.response_message ? true : false
    }));

    return NextResponse.json({ success: true, data: allReviews });
  } catch (error) {
    console.error('Error fetching reviews:', error);

    // Handle DNS/connection errors
    if (error.cause?.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND') || error.cause?.hostname) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database connection failed. The hostname cannot be resolved. Your DATABASE_URL format may be outdated.',
          hostname: error.cause?.hostname,
          currentFormat: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'),
          solution: 'Get the EXACT connection string from Supabase Dashboard (the format has changed):',
          stepByStep: [
            '1. Go to https://supabase.com/dashboard',
            '2. Select your project',
            '3. Click Settings (gear icon) → Database',
            '4. Scroll to "Connection string" section',
            '5. Select "URI" format (NOT JDBC)',
            '6. IMPORTANT: Change "Method" dropdown from "Direct connection" to "Connection pooling"',
            '7. Copy the connection string EXACTLY as shown (it will have pooler.supabase.com)',
            '8. Replace [YOUR-PASSWORD] with your actual database password',
            '9. Update DATABASE_URL in .env.local with the EXACT string',
            '10. Restart your dev server (Ctrl+C then npm run dev)',
            '',
            '💡 TIP: Direct connection may fail due to IPv6/DNS issues. Connection pooling is more reliable.'
          ],
          data: []
        },
        { status: 500 }
      );
    }

    // Handle table doesn't exist error
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.cause?.message?.includes('does not exist')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database table not found. Please run the migration SQL to create the reviews table. See migrations/create_reviews_table.sql or check REVIEWS_SETUP.md for instructions.',
          data: []
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const { name, email, stars, review } = await req.json();

    // Validation
    if (!name || !email || !stars || !review) {
      return NextResponse.json(
        { success: false, error: 'All fields are required' },
        { status: 400 }
      );
    }

    if (stars < 1 || stars > 5) {
      return NextResponse.json(
        { success: false, error: 'Stars must be between 1 and 5' },
        { status: 400 }
      );
    }

    if (name.trim().length < 2 || name.trim().length > 100) {
      return NextResponse.json(
        { success: false, error: 'Name must be between 2 and 100 characters' },
        { status: 400 }
      );
    }

    if (review.trim().length < 10 || review.trim().length > 2000) {
      return NextResponse.json(
        { success: false, error: 'Review must be between 10 and 2000 characters' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check if review exists for this email (case-insensitive)
    const existing = await db
      .select()
      .from(reviews)
      .where(eq(reviews.email, email.toLowerCase().trim()));

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: 'You have already submitted a review. Each email can only submit one review.' },
        { status: 400 }
      );
    }

    // Insert new review
    await db.insert(reviews).values({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      stars: parseInt(stars),
      review: review.trim(),
      created_at: new Date(), // Set the current timestamp
      response_by: null, // Default value for response_by
      response_message: null, // Default value for response_message
      is_read: false // Default value for is_read
    });

    return NextResponse.json({ success: true, message: 'Review submitted successfully!' });
  } catch (error) {
    console.error('Error submitting review:', error);

    // Handle DNS/connection errors
    if (error.cause?.code === 'ENOTFOUND' || error.message?.includes('ENOTFOUND') || error.cause?.hostname) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database connection failed. The hostname cannot be resolved. Your DATABASE_URL format may be outdated.',
          hostname: error.cause?.hostname,
          solution: 'Get the EXACT connection string from Supabase Dashboard:',
          instructions: [
            '1. Go to https://supabase.com/dashboard → Your Project → Settings → Database',
            '2. Copy the "Connection string" (URI format) EXACTLY as shown',
            '3. Replace [YOUR-PASSWORD] with your database password',
            '4. Update DATABASE_URL in .env.local',
            '5. Restart your dev server',
            '',
            '⚠️ The old format (db.[PROJECT-REF].supabase.co) no longer works.',
            '⚠️ Use the new format from Supabase Dashboard which includes region.'
          ]
        },
        { status: 500 }
      );
    }

    // Handle table doesn't exist error
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.cause?.message?.includes('does not exist')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Database table not found. Please run the migration SQL to create the reviews table. See migrations/create_reviews_table.sql or check REVIEWS_SETUP.md for instructions.'
        },
        { status: 500 }
      );
    }

    // Handle unique constraint violation
    if (error.code === '23505' || error.message?.includes('unique')) {
      return NextResponse.json(
        { success: false, error: 'You have already submitted a review. Each email can only submit one review.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to submit review. Please try again later.' },
      { status: 500 }
    );
  }
}
