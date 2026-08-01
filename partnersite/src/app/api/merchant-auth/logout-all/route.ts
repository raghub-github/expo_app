import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateMerchantFromSession } from '@/lib/auth/validate-merchant';
import { deactivateAllSessionsForMerchant } from '@/lib/auth/merchant-session-db';
import { expireSession } from '@/lib/auth/session-manager';
import {
  sessionStartCookie,
  lastActivityCookie,
  sessionIdCookie,
} from '@/lib/auth/auth-cookie-names';

/**
 * POST /api/merchant-auth/logout-all
 * Deactivates all merchant_sessions rows for this parent, then clears cookies on this browser (same as logout).
 */
export async function POST() {
  const cookieStore = await cookies();
  let deactivatedCount = 0;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json({ success: false, error: validation.error ?? 'Forbidden' }, { status: 403 });
    }
    deactivatedCount = await deactivateAllSessionsForMerchant(validation.merchantParentId);
  } catch (e) {
    console.error('[merchant-auth/logout-all]', e);
    return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
  }

  const response = NextResponse.json({
    success: true,
    deactivatedCount,
  });

  const cookieManager = {
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieStore.set(name, value, options as any);
      response.cookies.set(name, value, options as any);
    },
  };
  expireSession(cookieManager);

  const allCookies = cookieStore.getAll();
  const authCookieNames = allCookies.filter((c) => c.name.startsWith('sb-')).map((c) => c.name);
  // Keep device_id stable across logins (same as /api/auth/logout).
  const sessionNames = [sessionStartCookie(), lastActivityCookie(), sessionIdCookie()];
  const expireOpts = { maxAge: 0, expires: new Date(0), path: '/', sameSite: 'lax' as const };
  [...authCookieNames, ...sessionNames].forEach((name) => {
    const isSupabase = name.startsWith('sb-');
    const opts = { ...expireOpts, httpOnly: isSupabase };
    cookieStore.set(name, '', opts as any);
    response.cookies.set(name, '', opts as any);
  });

  return response;
}
