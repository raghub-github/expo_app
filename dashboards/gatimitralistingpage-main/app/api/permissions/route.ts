import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    let query = supabaseAdmin
      .from('permissions')
      .select(`
        *,
        user:users!permissions_userId_fkey (
          id,
          email,
          name,
          role,
          "isApproved"
        )
      `);

    if (userId) {
      query = query.eq('userId', userId);
    }

    const { data: permissions, error } = await query;

    if (error) {
      console.error('Permissions fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch permissions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ permissions: permissions || [] });
  } catch (error) {
    console.error('Permissions API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { userId, ...permissionUpdates } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Check if permission record exists
    const { data: existingPermission } = await supabaseAdmin
      .from('permissions')
      .select('id')
      .eq('userId', userId)
      .maybeSingle();

    let permission;
    let error;

    if (existingPermission) {
      // Update existing permission
      const result = await supabaseAdmin
        .from('permissions')
        .update({
          ...permissionUpdates,
          updatedAt: new Date().toISOString(),
        })
        .eq('userId', userId)
        .select()
        .single();
      
      permission = result.data;
      error = result.error;
    } else {
      // Create new permission record
      const result = await supabaseAdmin
        .from('permissions')
        .insert({
          userId,
          ...permissionUpdates,
        })
        .select()
        .single();
      
      permission = result.data;
      error = result.error;
    }

    if (error) {
      console.error('Permission update error:', error);
      return NextResponse.json(
        { error: 'Failed to update permissions' },
        { status: 500 }
      );
    }

    return NextResponse.json({ permission });
  } catch (error) {
    console.error('Permission update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

