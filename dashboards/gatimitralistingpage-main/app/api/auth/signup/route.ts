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

    const { email, password, name, role = 'agent' } = await request.json();
    
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

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 is "not found" which is fine
      console.error('Error checking existing user:', checkError);
      return NextResponse.json(
        { error: 'Database error. Please check your Supabase configuration.' },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Create new user
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert({
        email,
        password, // In production, hash this password
        name: name || email.split('@')[0],
        role,
        isApproved: role === 'super_admin' || role === 'admin', // Auto-approve admins
      })
      .select()
      .single();

    if (error) {
      console.error('Signup error:', error);
      
      // Provide more specific error messages
      if (error.code === '23505' || error.message?.includes('duplicate')) {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 400 }
        );
      }
      
      if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { error: 'Database tables not found. Please run the database initialization script (scripts/init-db.sql) in your Supabase SQL Editor.' },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: `Failed to create user: ${error.message || 'Unknown error'}` },
        { status: 500 }
      );
    }

    // Create default permissions (ignore errors if permissions table doesn't exist or user already has permissions)
    try {
      await supabaseAdmin.from('permissions').insert({
        userId: user.id,
        canAccessOrders: false,
        canCreateRefund: false,
        canAccessCancellation: false,
        canManageAgents: false,
        canManageDepartments: false,
      });
    } catch (permError) {
      // Permissions might already exist or table might not be set up yet
      console.warn('Permission creation warning:', permError);
    }

    // Return user data (without password)
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json({ user: userWithoutPassword });
  } catch (error: any) {
    console.error('Signup error:', error);
    
    // Provide more specific error messages
    if (error?.message?.includes('duplicate') || error?.code === '23505') {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }
    
    if (error?.message?.includes('connection') || error?.message?.includes('network')) {
      return NextResponse.json(
        { error: 'Database connection error. Please check your Supabase configuration.' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: error?.message || 'Failed to create user. Please check your database setup.' },
      { status: 500 }
    );
  }
}

