import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { isNetworkOrTransientError } from "@/lib/auth/session-errors";
import {
  countActiveSessionsForMerchant,
  listActiveSessionsForMerchant,
} from "@/lib/auth/merchant-session-db";
import { deviceIdCookie } from "@/lib/auth/auth-cookie-names";

/**
 * GET /api/merchant-auth/sessions
 * Lists active device sessions for the logged-in merchant parent (for logout-all UI).
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      if (userError && isNetworkOrTransientError(userError)) {
        return NextResponse.json(
          { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        { success: false, error: validation.error ?? "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const cookieStore = await cookies();
    const currentDeviceId = cookieStore.get(deviceIdCookie())?.value?.trim() ?? null;
    const merchantId = validation.merchantParentId;

    const [sessions, activeCount] = await Promise.all([
      listActiveSessionsForMerchant(merchantId, currentDeviceId),
      countActiveSessionsForMerchant(merchantId),
    ]);

    return NextResponse.json({
      success: true,
      merchantId,
      activeCount,
      currentDeviceId,
      sessions,
    });
  } catch (e) {
    console.error("[merchant-auth/sessions]", e);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
