import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantForLogin } from "@/lib/auth/validate-merchant";

/** POST /api/auth/login — Login with email + password (registered merchant). */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    const normalizedEmail = (email || "").trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: String(password),
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "Invalid email or password." },
        { status: 401 }
      );
    }

    if (!data?.user?.email) {
      return NextResponse.json(
        { success: false, error: "Login failed. Please try again." },
        { status: 401 }
      );
    }

    const validation = await validateMerchantForLogin(data.user.email);
    if (!validation.isValid) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { success: false, error: validation.error || "Not authorized for merchant dashboard." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        session: data.session,
        user: data.user,
        merchant: {
          parent_merchant_id: validation.parentMerchantId,
          merchant_parent_id: validation.merchantParentId,
        },
      },
    });
  } catch (e) {
    console.error("[auth/login] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
