import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { listQueue, assignReview, resolveReview } from "@/lib/db/operations/verification-queue";

export const runtime = "nodejs";

const patchSchema = z.union([
  z.object({ kind: z.literal("assign"), reviewId: z.number().int().positive() }),
  z.object({
    kind: z.literal("resolve"),
    reviewId: z.number().int().positive(),
    decision: z.enum(["verified", "rejected", "overridden"]),
    notes: z.string().max(2000).optional().nullable(),
  }),
]);

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const subject = req.nextUrl.searchParams.get("subjectType");
  if (subject !== "rider" && subject !== "merchant_store") {
    return NextResponse.json({ success: false, error: "subjectType required" }, { status: 400 });
  }
  const includeResolved = req.nextUrl.searchParams.get("includeResolved") === "1";
  try {
    const rows = await listQueue(subject, includeResolved);
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const systemUser = await getSystemUserByEmail(user?.email ?? undefined);
  if (!systemUser?.id) return NextResponse.json({ success: false, error: "system_user_missing" }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    if (parsed.data.kind === "assign") {
      await assignReview(parsed.data.reviewId, systemUser.id);
      return NextResponse.json({ success: true });
    }
    await resolveReview(
      parsed.data.reviewId,
      parsed.data.decision,
      parsed.data.notes ?? null,
      systemUser.id,
      req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
      req.headers.get("user-agent") ?? null,
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 },
    );
  }
}
