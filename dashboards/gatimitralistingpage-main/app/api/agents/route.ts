import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    // Get agents
    const { data: agentsData, error } = await supabaseAdmin
      .from('agents')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) {
      console.error('Agents fetch error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch agents' },
        { status: 500 }
      );
    }

    // Get user roles for each agent
    const agentsWithRoles = await Promise.all(
      (agentsData || []).map(async (agent) => {
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('id, role, "isApproved"')
          .eq('email', agent.email)
          .maybeSingle();

        return {
          ...agent,
          user: userData || null,
        };
      })
    );

    return NextResponse.json({ agents: agentsWithRoles });
  } catch (error) {
    console.error('Agents API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { agentId, email, password, name, createdBy } = await request.json();

    if (!agentId || !email || !password) {
      return NextResponse.json(
        { error: 'Agent ID, email, and password are required' },
        { status: 400 }
      );
    }

    // Check if agent ID already exists
    const { data: existingAgent } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('agentId', agentId)
      .single();

    if (existingAgent) {
      return NextResponse.json(
        { error: 'Agent ID already exists' },
        { status: 400 }
      );
    }

    // Create agent
    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .insert({
        agentId,
        email,
        password, // In production, hash this
        name: name || email.split('@')[0],
        isActive: true,
        isApproved: false,
        createdBy,
      })
      .select()
      .single();

    if (error) {
      console.error('Agent creation error:', error);
      return NextResponse.json(
        { error: 'Failed to create agent' },
        { status: 500 }
      );
    }

    // Also create user entry
    const { error: userError } = await supabaseAdmin.from('users').insert({
      email,
      password,
      name: name || email.split('@')[0],
      role: 'agent',
      isApproved: false,
    });

    if (userError && userError.code !== '23505') { // Ignore duplicate email error
      console.error('User creation error:', userError);
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Agent creation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

