import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  deleteStoreTypeDocumentRequirement,
  upsertStoreTypeDocumentRequirement,
} from "@/lib/db/operations/merchant-onboarding-document-types";

export const runtime = "nodejs";

const upsertSchema = z.object({
  storeType: z.string().min(1).max(64),
  documentCode: z.string().min(1).max(64),
  isMandatory: z.boolean().optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

const deactivateSchema = z.object({
  storeType: z.string().min(1).max(64),
  documentCode: z.string().min(1).max(64),
});

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const row = await upsertStoreTypeDocumentRequirement(parsed.data);
    return NextResponse.json({ success: true, row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save";
    const status = msg.includes("foreign key") || msg.includes("violates") ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireSuperAdminApi(req);
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = deactivateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  try {
    const deleted = await deleteStoreTypeDocumentRequirement(
      parsed.data.storeType,
      parsed.data.documentCode
    );
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
