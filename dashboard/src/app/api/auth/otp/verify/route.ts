import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateUserForLogin } from "@/lib/auth/user-validation";
import { recordFailedLogin, recordLogin } from "@/lib/auth/user-management";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";

export async function POST(request: NextRequest) {
  try {
    const { email, phone, token, type } = await request.json();

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.auth.verifyOtp({
      [type === "phone" ? "phone" : "email"]: email || phone,
      token,
      type: type === "phone" ? "sms" : "email",
    });

    if (error) {
      if (email) {
        await recordFailedLogin(
          email,
          error.message,
          getIpAddress(request),
          getUserAgent(request)
        );
      }
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    // After successful OTP verification, validate user exists in system_users and has roles
    if (data?.user?.email) {
      const validation = await validateUserForLogin(data.user.email);
      
      if (!validation.isValid) {
        await recordFailedLogin(
          data.user.email,
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

      if (validation.systemUserId) {
        await recordLogin(
          validation.systemUserId,
          "otp",
          getIpAddress(request),
          getUserAgent(request)
        );
      }
    } else if (data?.user?.phone) {
      // For phone-based login, we need to find the user by phone
      // For now, reject phone login if email is not available
      return NextResponse.json(
        { 
          success: false, 
          error: "Phone-based login is not supported for dashboard access. Please use email login." 
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
