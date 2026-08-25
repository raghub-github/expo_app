import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertRiderOnboardingDocumentType,
  listRiderOnboardingDocumentTypes,
} from "@/lib/db/operations/rider-onboarding-document-types";

export const runtime = "nodejs";

const postSchema = z.object({
  code: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  hint: z.string().max(500).optional().nullable(),
  icon: z.string().max(64).optional().nullable(),
  captureGroup: z.enum(["dl_rc", "rental_ev"]),
  requiresTextField: z.boolean().optional(),
  textFieldLabel: z.string().max(200).optional().nullable(),
  textFieldPlaceholder: z.string().max(200).optional().nullable(),
  minTextLength: z.number().int().min(0).max(64).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  const captureGroup = req.nextUrl.searchParams.get("captureGroup");
  try {
    const rows = await listRiderOnboardingDocumentTypes({
      activeOnly: false,
      captureGroup:
        captureGroup === "dl_rc" || captureGroup === "rental_ev" ? captureGroup : undefined,
    });
    return NextResponse.json({ success: true, rows });
  } catch (e) {
    console.error("[super-admin rider-onboarding-document-types GET]", e);
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
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
    const row = await insertRiderOnboardingDocumentType({
      code: parsed.data.code.trim().toLowerCase().replace(/\s+/g, "_"),
      label: parsed.data.label,
      hint: parsed.data.hint,
      icon: parsed.data.icon,
      captureGroup: parsed.data.captureGroup,
      requiresTextField: parsed.data.requiresTextField,
      textFieldLabel: parsed.data.textFieldLabel,
      textFieldPlaceholder: parsed.data.textFieldPlaceholder,
      minTextLength: parsed.data.minTextLength,
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
