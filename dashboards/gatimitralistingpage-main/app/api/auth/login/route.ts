import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Check for Supabase configuration first
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { 
          error: 'Database not configured. Please create a .env.local file with your Supabase credentials. See ENV_SETUP.md for instructions.' 
        },
        { status: 500 }
      );
    }

    const { email, password } = await request.json();
    
    // Get Supabase client after validation
    let supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
    try {
      supabaseAdmin = getSupabaseAdmin();
    } catch (error: any) {
      return NextResponse.json(
        { 
          error: 'Database not configured. Please create a .env.local file with your Supabase credentials. See ENV_SETUP.md for instructions.' 
        },
        { status: 500 }
      );
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Check user in users table
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password (in production, use proper hashing)
    if (user.password !== password) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Check if user is approved (for agents)
    if (user.role === 'agent' && !user.isApproved) {
      return NextResponse.json(
        { error: 'Your account is pending approval from Super Admin' },
        { status: 403 }
      );
    }

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json({ user: userWithoutPassword });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

