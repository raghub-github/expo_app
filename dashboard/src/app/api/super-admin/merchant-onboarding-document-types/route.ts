import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  insertMerchantOnboardingDocumentType,
  listAcceptanceStoreTypes,
  listCuisineListFlags,
  listMerchantOnboardingDocumentTypes,
  listMerchantStoreTypeDocumentMap,
} from "@/lib/db/operations/merchant-onboarding-document-types";

export const runtime = "nodejs";

const postSchema = z.object({
  code: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  hint: z.string().max(500).optional().nullable(),
  formSection: z.enum(["PAN", "AADHAAR", "LICENCE", "GST", "BANK"]),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  try {
    const [storeTypes, catalog, requirements, cuisineFlags] = await Promise.all([
      listAcceptanceStoreTypes(),
      listMerchantOnboardingDocumentTypes({ activeOnly: false }),
      listMerchantStoreTypeDocumentMap(),
      listCuisineListFlags(),
    ]);
    return NextResponse.json({ success: true, storeTypes, catalog, requirements, cuisineFlags });
  } catch (e) {
    console.error("[super-admin merchant-onboarding-document-types GET]", e);
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
    const row = await insertMerchantOnboardingDocumentType(parsed.data);
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create";
    const status = msg.includes("unique") || msg.includes("duplicate") ? 409 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
