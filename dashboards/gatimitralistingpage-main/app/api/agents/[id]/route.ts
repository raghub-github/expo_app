import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await request.json();
    const { isActive, isApproved, role } = body;

    const updateData: any = {
      updatedAt: new Date().toISOString(),
    };

    if (typeof isActive === 'boolean') {
      updateData.isActive = isActive;
    }

    if (typeof isApproved === 'boolean') {
      updateData.isApproved = isApproved;
    }

    // Get agent email first
    const { data: agentData } = await supabaseAdmin
      .from('agents')
      .select('email')
      .eq('id', params.id)
      .single();

    if (agentData) {
      // Update user table if needed
      const userUpdateData: any = {};
      
      if (typeof isApproved === 'boolean') {
        userUpdateData.isApproved = isApproved;
      }

      // Update role if provided (Super Admin can make anyone admin, Admin can demote to agent)
      if (role && (role === 'admin' || role === 'agent')) {
        userUpdateData.role = role;
      }

      if (Object.keys(userUpdateData).length > 0) {
        await supabaseAdmin
          .from('users')
          .update(userUpdateData)
          .eq('email', agentData.email);
      }
    }

    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Agent update error:', error);
      return NextResponse.json(
        { error: 'Failed to update agent' },
        { status: 500 }
      );
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Agent update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    
    // Get agent email before deletion
    const { data: agent } = await supabaseAdmin
      .from('agents')
      .select('email')
      .eq('id', params.id)
      .single();

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    // Delete from agents table
    const { error: agentError } = await supabaseAdmin
      .from('agents')
      .delete()
      .eq('id', params.id);

    if (agentError) {
      console.error('Agent deletion error:', agentError);
      return NextResponse.json(
        { error: 'Failed to delete agent' },
        { status: 500 }
      );
    }

    // Delete from users table (this will cascade delete permissions)
    const { error: userError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('email', agent.email);

    if (userError) {
      console.error('User deletion error:', userError);
      // Continue even if user deletion fails (user might not exist)
    }

    return NextResponse.json({ 
      message: 'Agent and user credentials deleted successfully',
      success: true 
    });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

