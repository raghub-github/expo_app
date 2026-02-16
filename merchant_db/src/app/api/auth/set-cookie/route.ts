import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { initializeSession } from "@/lib/auth/session-manager";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";

/**
 * POST /api/auth/set-cookie
 * Call after successful login. Sets Supabase session cookies and custom 24h session cookies.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { access_token?: string; refresh_token?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body", code: "INVALID_BODY" },
        { status: 400 }
      );
    }
    const { access_token, refresh_token } = body ?? {};
    if (!access_token || !refresh_token) {
      return NextResponse.json(
        { success: false, error: "Missing tokens", code: "MISSING_TOKENS" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const response = NextResponse.json({ success: true });
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    if (data.session?.user) {
      const validation = await validateMerchantFromSession(data.session.user);
      if (!validation.isValid) {
        await supabase.auth.signOut();
        return NextResponse.json(
          {
            success: false,
            error: validation.error || "Not authorized for merchant dashboard.",
          },
          { status: 403 }
        );
      }
    }

    const cookieManager = {
      set: (name: string, value: string, options: Record<string, unknown>) => {
        cookieStore.set(name, value, options as any);
        response.cookies.set(name, value, options as any);
      },
    };
    initializeSession(cookieManager);

    return response;
  } catch (e) {
    const message = e instanceof Error ? e.message : "set-cookie error";
    return NextResponse.json(
      { success: false, error: message, code: "SET_COOKIE_ERROR" },
      { status: 500 }
    );
  }
}
