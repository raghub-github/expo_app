import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // Check for Supabase configuration first
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          error: 'Database not configured. Please create a .env.local file with your Supabase credentials.',
        },
        { status: 500 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { userId, newPassword } = await request.json();

    if (!userId || !newPassword) {
      return NextResponse.json(
        { error: 'User ID and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Update password in users table
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .update({ password: newPassword })
      .eq('id', userId)
      .select()
      .single();

    if (userError) {
      console.error('Password update error:', userError);
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    // Also update password in agents table if user is an agent
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('email', user.email)
      .maybeSingle();

    if (agent) {
      await supabaseAdmin
        .from('agents')
        .update({ password: newPassword })
        .eq('id', agent.id);
    }

    return NextResponse.json({
      message: 'Password updated successfully',
      success: true,
    });
  } catch (error: any) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}



