import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { initializeSession } from "@/lib/auth/session-manager";
import { validateUserForLogin } from "@/lib/auth/user-validation";
import { recordFailedLogin, recordLogin } from "@/lib/auth/user-management";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";

export async function POST(request: NextRequest) {
  // #region agent log - DISABLED: Agent log service not available
  // Agent log calls disabled to prevent JSON parsing errors
  // #endregion

  try {
    const { access_token, refresh_token } = await request.json();

    // #region agent log - DISABLED: Agent log service not available
    // Agent log calls disabled to prevent JSON parsing errors
    // #endregion

    if (!access_token || !refresh_token) {
      return NextResponse.json({ success: false, error: "Missing tokens" }, { status: 400 });
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

    // #region agent log - DISABLED: Agent log service not available
    // Agent log calls disabled to prevent JSON parsing errors
    // #endregion

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    let systemUserId: number | null = null;

    // Validate user exists in system_users and has roles before setting session
    if (data.session?.user?.email) {
      const email = data.session.user.email;
      const validation = await validateUserForLogin(email);
      
      if (!validation.isValid) {
        await recordFailedLogin(
          email,
          validation.error || "User not authorized for dashboard access",
          getIpAddress(request),
          getUserAgent(request)
        );
        // Sign out the user from Supabase since they're not valid
        await supabase.auth.signOut();
        
        return NextResponse.json(
          { 
            success: false, 
            error: validation.error || "Your account is not authorized to access this portal. Please contact an administrator." 
          },
          { status: 403 }
        );
      }

      systemUserId = validation.systemUserId ?? null;
    }

    // Initialize custom session management (24h activity-based, 7 day max)
    if (data.session) {
      const cookieManager = {
        set: (name: string, value: string, options: any) => {
          cookieStore.set(name, value, options);
          response.cookies.set(name, value, options);
        },
      };
      initializeSession(cookieManager);
      console.log("[set-cookie] Session initialized with 24h activity-based renewal");

      if (data.session.user?.email && systemUserId) {
        const provider = data.session.user.app_metadata?.provider || "unknown";
        await recordLogin(
          systemUserId,
          provider,
          getIpAddress(request),
          getUserAgent(request)
        );
      }
    }

    return response;
  } catch (e: any) {
    // #region agent log - DISABLED: Agent log service not available
    // Agent log calls disabled to prevent JSON parsing errors
    // #endregion
    return NextResponse.json({ success: false, error: "set-cookie error" }, { status: 500 });
  }
}
