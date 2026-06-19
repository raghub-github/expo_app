import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: departments, error } = await supabaseAdmin
      .from('departments')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Departments fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch departments' },
        { status: 500 }
      );
    }

    return NextResponse.json({ departments: departments || [] });
  } catch (error) {
    console.error('Departments API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { id, isEnabled, enabledBy } = await request.json();

    if (!id || typeof isEnabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Department ID and enabled status are required' },
        { status: 400 }
      );
    }

    const updateData: any = {
      isEnabled,
      updatedAt: new Date().toISOString(),
    };

    if (isEnabled && enabledBy) {
      updateData.enabledBy = enabledBy;
      updateData.enabledAt = new Date().toISOString();
    } else if (!isEnabled) {
      updateData.enabledBy = null;
      updateData.enabledAt = null;
    }

    const { data: department, error } = await supabaseAdmin
      .from('departments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Department update error:', error);
      return NextResponse.json(
        { error: 'Failed to update department' },
        { status: 500 }
      );
    }

    return NextResponse.json({ department });
  } catch (error) {
    console.error('Department update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

