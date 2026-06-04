import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deactivateRiderOnboardingDocumentType,
  updateRiderOnboardingDocumentType,
} from "@/lib/db/operations/rider-onboarding-document-types";

export const runtime = "nodejs";

const patchSchema = z.object({
  code: z.string().min(1).max(64).optional(),
  label: z.string().min(1).max(200).optional(),
  hint: z.string().max(500).optional().nullable(),
  icon: z.string().max(64).optional().nullable(),
  captureGroup: z.enum(["dl_rc", "rental_ev"]).optional(),
  requiresTextField: z.boolean().optional(),
  textFieldLabel: z.string().max(200).optional().nullable(),
  textFieldPlaceholder: z.string().max(200).optional().nullable(),
  minTextLength: z.number().int().min(0).max(64).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const row = await updateRiderOnboardingDocumentType(id, {
      ...parsed.data,
      ...(parsed.data.code !== undefined
        ? { code: parsed.data.code.trim().toLowerCase().replace(/\s+/g, "_") }
        : {}),
    });
    if (!row) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
  }
  try {
    const row = await deactivateRiderOnboardingDocumentType(id);
    if (!row) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to deactivate";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
