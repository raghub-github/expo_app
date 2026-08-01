import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PREVENT_SERVICE_CODES } from "@/lib/db/operations/prevent-services-shared";
import {
  createPreventServiceRule,
  listPreventServiceRules,
  type PreventRuleStatus,
} from "@/lib/db/operations/prevent-services-admin";
import {
  countImpactForRule,
  getPreventSignalVersion,
} from "@/lib/db/operations/prevent-services-impact";

export const runtime = "nodejs";

const serviceCodeSchema = z.enum(PREVENT_SERVICE_CODES);

const postSchema = z.object({
  searchType: z.enum(["flat_search", "lat_lng"]),
  placeId: z.string().max(256).optional().nullable(),
  locationName: z.string().min(1).max(240),
  address: z.string().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusMeters: z.number().int().min(50).max(100_000),
  blockedServices: z.array(serviceCodeSchema).min(1),
  reason: z.string().max(120).optional().nullable(),
  reasonCustom: z.string().max(500).optional().nullable(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  status: z.enum(["active", "paused"]).optional(),
});

async function actor() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return {
    adminId: user?.id ?? null,
    adminName: user?.user_metadata?.full_name || user?.email || null,
  };
}

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const statusRaw = req.nextUrl.searchParams.get("status");
  const status: PreventRuleStatus | "all" =
    statusRaw === "active" ||
    statusRaw === "paused" ||
    statusRaw === "expired" ||
    statusRaw === "deleted"
      ? statusRaw
      : "all";

  try {
    const rules = await listPreventServiceRules({ status });
    const signalVersion = await getPreventSignalVersion();
    const withImpact = await Promise.all(
      rules.map(async (rule) => {
        if (rule.status !== "active") {
          return { ...rule, affectedMerchants: 0, affectedRiders: 0 };
        }
        const impact = await countImpactForRule({
          latitude: rule.latitude,
          longitude: rule.longitude,
          radiusMeters: rule.radiusMeters,
          blockedServices: rule.blockedServices,
        });
        return {
          ...rule,
          affectedMerchants: impact.affectedMerchants,
          affectedRiders: impact.affectedRiders,
        };
      })
    );
    return NextResponse.json({ ok: true, rules: withImpact, signalVersion });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    if (/prevent_service_/i.test(msg)) {
      return NextResponse.json(
        {
          error: "Migration required: apply 0476_prevent_services.sql",
          migrationRequired: true,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const who = await actor();
    const rule = await createPreventServiceRule({
      ...parsed.data,
      adminId: who.adminId,
      adminName: who.adminName,
    });
    return NextResponse.json({ ok: true, rule }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Insert failed";
    const status =
      e && typeof e === "object" && "statusCode" in e
        ? Number((e as { statusCode?: number }).statusCode) || 500
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
