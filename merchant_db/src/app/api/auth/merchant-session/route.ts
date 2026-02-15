import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isInvalidRefreshToken, isNetworkOrTransientError } from "@/lib/auth/session-errors";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";

const maxGetUserAttempts = 3;
const retryDelaysMs = [800, 1600];

/** GET /api/auth/merchant-session — Supabase-based merchant session (does not conflict with NextAuth /api/auth/session). */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    let user: { id: string; email?: string; phone?: string } | null = null;
    let userError: unknown = null;

    for (let attempt = 1; attempt <= maxGetUserAttempts; attempt++) {
      const result = await supabase.auth.getUser();
      user = result.data?.user
        ? {
            id: result.data.user.id,
            email: result.data.user.email ?? undefined,
            phone: result.data.user.phone ?? undefined,
          }
        : null;
      userError = result.error ?? null;
      if (!userError && user) break;
      if (userError && isInvalidRefreshToken(userError)) break;
      if (userError && isNetworkOrTransientError(userError) && attempt < maxGetUserAttempts) {
        await new Promise((r) => setTimeout(r, retryDelaysMs[attempt - 1] ?? 1000));
        continue;
      }
      // After redirect/callback, cookies may not be applied yet; retry once after short delay
      if (!user && !userError && attempt < maxGetUserAttempts) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      break;
    }

    if (userError || !user) {
      if (userError && isInvalidRefreshToken(userError)) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { success: false, error: "Session invalid", code: "SESSION_INVALID" },
          { status: 401 }
        );
      }
      if (userError && isNetworkOrTransientError(userError)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      // Not logged in: return 200 so console doesn't show 401 (client checks success flag)
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 200 }
      );
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError && isInvalidRefreshToken(sessionError)) {
      await supabase.auth.signOut();
      return NextResponse.json(
        { success: false, error: "Session invalid", code: "SESSION_INVALID" },
        { status: 401 }
      );
    }
    if (!session) {
      return NextResponse.json(
        { success: false, error: "No active session", code: "SESSION_REQUIRED" },
        { status: 200 }
      );
    }

    // Load parent so UI can show blocked/suspended and disable child registration
    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    const parent = validation.isValid
      ? {
          id: validation.merchantParentId,
          parent_merchant_id: validation.parentMerchantId,
          approval_status: validation.approvalStatus ?? undefined,
          registration_status: validation.registrationStatus ?? undefined,
          is_active: validation.isActive,
          can_register_child: true,
        }
      : {
          id: validation.merchantParentId,
          parent_merchant_id: validation.parentMerchantId,
          approval_status: validation.approvalStatus ?? undefined,
          registration_status: validation.registrationStatus ?? undefined,
          is_active: validation.isActive,
          can_register_child: false,
          block_message: validation.error ?? "Account restricted.",
        };

    return NextResponse.json({
      success: true,
      data: {
        session,
        user: { id: user.id, email: user.email, phone: user.phone },
        parent: validation.merchantParentId != null ? parent : null,
      },
    });
  } catch (error) {
    if (isNetworkOrTransientError(error)) {
      return NextResponse.json(
        { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
