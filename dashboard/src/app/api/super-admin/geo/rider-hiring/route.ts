import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  clearRiderGeoHiring,
  getRiderGeoHiringExplicit,
  resolveRiderGeoHiringEffective,
  applyRiderGeoHiringToggle,
  type GeoHierarchyLevel,
} from "@/lib/db/operations/rider-geo-hiring-admin";

export const runtime = "nodejs";

const levelSchema = z.enum(["state", "region", "district", "division", "post_office", "pincode"]);

const querySchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
});

const bodySchema = z.object({
  level: levelSchema,
  refId: z.string().uuid(),
  hiringEnabled: z.boolean(),
  /** When true and hiringEnabled matches parent inherit, soft-delete instead of upsert. */
  clearIfInherit: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    level: url.searchParams.get("level"),
    refId: url.searchParams.get("refId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "level and refId required" }, { status: 400 });
  }

  const level = parsed.data.level as GeoHierarchyLevel;
  const [explicit, effective] = await Promise.all([
    getRiderGeoHiringExplicit({ level, refId: parsed.data.refId }),
    resolveRiderGeoHiringEffective({ level, refId: parsed.data.refId }),
  ]);

  return NextResponse.json({
    ok: true,
    explicit,
    hiringEnabled: effective.hiringEnabled,
    explicitOnNode: effective.explicit,
    sourceLevel: effective.sourceLevel,
  });
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

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const level = parsed.data.level as GeoHierarchyLevel;
  try {
    if (parsed.data.clearIfInherit) {
      await clearRiderGeoHiring({ level, refId: parsed.data.refId });
      const effective = await resolveRiderGeoHiringEffective({
        level,
        refId: parsed.data.refId,
      });
      return NextResponse.json({
        ok: true,
        cleared: true,
        hiringEnabled: effective.hiringEnabled,
        explicitOnNode: false,
        sourceLevel: effective.sourceLevel,
      });
    }

    const row = await applyRiderGeoHiringToggle({
      level,
      refId: parsed.data.refId,
      hiringEnabled: parsed.data.hiringEnabled,
      notes: parsed.data.notes ?? null,
    });
    // Re-resolve so response matches tree attach (explicit-on-node, source).
    const effective = await resolveRiderGeoHiringEffective({
      level,
      refId: parsed.data.refId,
    });
    return NextResponse.json({
      ok: true,
      row,
      hiringEnabled: effective.hiringEnabled,
      explicitOnNode: effective.explicit,
      sourceLevel: effective.sourceLevel,
      cascaded: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Toggle failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
