import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getCancellationCatalogPayload,
  insertCancellationReasonCatalog,
  slugifyCancellationReasonCode,
} from "@/lib/db/operations/order-cancellation-reason-catalog";
import { ensureCancellationCatalogSchema } from "@/lib/db/operations/ensure-cancellation-catalog-schema";

export const runtime = "nodejs";

const postSchema = z.object({
  attribute: z.string().min(1).max(32),
  label: z.string().min(1).max(500),
  reasonCode: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const { attributes, grouped } = await getCancellationCatalogPayload({
      activeOnly: false,
    });
    const rows = Object.values(grouped).flat();
    return NextResponse.json({ success: true, rows, attributes, grouped });
  } catch (e) {
    console.error("[super-admin order-cancellation-reason-catalog GET]", e);
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const attribute = parsed.data.attribute.trim().toUpperCase();
    const reasonCode =
      parsed.data.reasonCode?.trim() ||
      `${attribute.toLowerCase()}__${slugifyCancellationReasonCode(parsed.data.label)}`;
    const row = await insertCancellationReasonCatalog({
      attribute,
      label: parsed.data.label,
      reasonCode,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
    });
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
