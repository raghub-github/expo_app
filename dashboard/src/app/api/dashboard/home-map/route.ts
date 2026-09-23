/**
 * GET /api/dashboard/home-map — any authenticated dashboard user (drives Home render).
 * PUT /api/dashboard/home-map — Super Admin only (persist live | static mode).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getHomeMapSettings,
  setHomeMapMode,
} from "@/lib/db/operations/home-map-settings";
import { isHomeMapMode } from "@/lib/home-map/shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);

    const settings = await getHomeMapSettings();
    return NextResponse.json({ success: true, ...settings });
  } catch (err) {
    console.error("[api/dashboard/home-map] GET failed", err);
    return NextResponse.json(
      { success: false, error: "Failed to load home map settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const modeRaw =
    body && typeof body === "object" && "mode" in body
      ? (body as { mode?: unknown }).mode
      : undefined;
  if (!isHomeMapMode(modeRaw)) {
    return NextResponse.json(
      { success: false, error: "mode must be 'live' or 'static'" },
      { status: 400 }
    );
  }

  try {
    const settings = await setHomeMapMode(modeRaw);
    return NextResponse.json({ success: true, ...settings });
  } catch (err) {
    console.error("[api/dashboard/home-map] PUT failed", err);
    return NextResponse.json(
      { success: false, error: "Failed to update home map mode" },
      { status: 500 }
    );
  }
}
