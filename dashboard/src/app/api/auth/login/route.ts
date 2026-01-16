import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { recordFailedLogin, recordLogin } from "@/lib/auth/user-management";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      await recordFailedLogin(
        email,
        error.message,
        getIpAddress(request),
        getUserAgent(request)
      );
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    if (data?.user?.email) {
      const systemUser = await getSystemUserByEmail(data.user.email);
      if (systemUser) {
        await recordLogin(
          systemUser.id,
          "password",
          getIpAddress(request),
          getUserAgent(request)
        );
      }
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
