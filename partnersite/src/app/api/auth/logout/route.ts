import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { expireSession } from "@/lib/auth/session-manager";
import { deactivateSessionForDevice } from "@/lib/auth/merchant-session-db";
import {
  sessionStartCookie,
  lastActivityCookie,
  sessionIdCookie,
  deviceIdCookie,
} from "@/lib/auth/auth-cookie-names";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const response = NextResponse.json({ success: true });

  const deviceId = cookieStore.get(deviceIdCookie())?.value?.trim();
  if (deviceId) {
    try {
      await deactivateSessionForDevice(deviceId);
    } catch (e) {
      console.warn("[logout] deactivateSessionForDevice failed:", e);
    }
  }

  // Do NOT call supabase.auth.signOut() — it can invalidate refresh tokens for all devices.
  // We only clear this device's cookies so other devices stay logged in.

  const cookieManager = {
    set: (name: string, value: string, options: Record<string, unknown>) => {
      cookieStore.set(name, value, options as any);
      response.cookies.set(name, value, options as any);
    },
  };
  expireSession(cookieManager);

  const allCookies = cookieStore.getAll();
  const authCookieNames = allCookies
    .filter((c) => c.name.startsWith("sb-"))
    .map((c) => c.name);
  const sessionNames = [
    sessionStartCookie(),
    lastActivityCookie(),
    sessionIdCookie(),
    deviceIdCookie(),
  ];
  const expireOpts = { maxAge: 0, expires: new Date(0), path: "/", sameSite: "lax" as const };
  [...authCookieNames, ...sessionNames].forEach((name) => {
    const isSupabase = name.startsWith("sb-");
    const opts = { ...expireOpts, httpOnly: isSupabase };
    cookieStore.set(name, "", opts as any);
    response.cookies.set(name, "", opts as any);
  });

  return response;
}
