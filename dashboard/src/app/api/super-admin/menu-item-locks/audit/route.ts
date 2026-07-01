import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/super-admin-api';
import { supabaseAdmin } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * GET /api/super-admin/menu-item-locks/audit?menuItemPk=123
 */
export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const menuItemPk = Number(req.nextUrl.searchParams.get('menuItemPk') ?? '');
  if (!Number.isFinite(menuItemPk) || menuItemPk <= 0) {
    return NextResponse.json({ error: 'menuItemPk is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('merchant_menu_item_lock_audit')
    .select('*')
    .eq('menu_item_id', menuItemPk)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, audit: data ?? [] });
}
