import { NextRequest, NextResponse } from "next/server";
import {
  getReferralSettingsAdmin,
  publicReferralFlagFromSettings,
} from "@/lib/db/operations/referral-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "no-store" };

function parseUserType(raw: string | null): "customer" | "rider" | "merchant" {
  if (raw === "customer" || raw === "rider" || raw === "merchant") return raw;
  return "merchant";
}

export async function GET(request: NextRequest) {
  const userType = parseUserType(request.nextUrl.searchParams.get("userType"));
  const sinceRaw = request.nextUrl.searchParams.get("sinceVersion");
  const since = sinceRaw != null && sinceRaw !== "" ? Number(sinceRaw) : NaN;

  try {
    const settings = await getReferralSettingsAdmin();
    const pub = publicReferralFlagFromSettings(settings, userType);
    if (Number.isFinite(since) && pub.configVersion > 0 && pub.configVersion <= since) {
      return NextResponse.json({ ok: true, unchanged: true }, { status: 200, headers: noStore });
    }
    return NextResponse.json({ ok: true, ...pub }, { status: 200, headers: noStore });
  } catch {
    return NextResponse.json(
      { ok: true, referralEnabled: false, configVersion: 0 },
      { status: 200, headers: noStore }
    );
  }
}
