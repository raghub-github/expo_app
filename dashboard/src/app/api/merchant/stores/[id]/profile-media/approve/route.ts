/**
 * POST /api/merchant/stores/[id]/profile-media/approve
 * Body: { kinds: Array<'banner' | 'gallery'> }
 * Applies pending banner/gallery resubmissions and marks those images approved.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateMerchantStoreForId } from "@/lib/merchant-store-route-auth";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { approveStoreProfileMedia, type ProfileMediaKind } from "@/lib/merchant/approve-store-profile-media";
import { assertMerchantStoreMutation } from "@/lib/permissions/merchant-access";

export const runtime = "nodejs";

function parseKinds(body: unknown): ProfileMediaKind[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { kinds?: unknown }).kinds;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return [...new Set(list.map((k) => String(k).trim().toLowerCase()))].filter(
    (k): k is ProfileMediaKind => k === "banner" || k === "gallery"
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const access = await authenticateMerchantStoreForId(request, storeId);
    if (!access.ok) return access.response;

    const email = access.user.email?.trim() || "";
    const mutation = await assertMerchantStoreMutation(access.user.id, email, [
      "can_approve_store",
      "can_approve_documents",
      "can_update_store_details",
    ]);
    if (!mutation.ok) {
      return NextResponse.json({ success: false, error: mutation.error }, { status: mutation.status });
    }

    const body = await request.json().catch(() => ({}));
    const kinds = parseKinds(body);
    if (kinds.length === 0) {
      return NextResponse.json(
        { success: false, error: "kinds must include banner and/or gallery" },
        { status: 400 }
      );
    }

    const systemUser = email ? await getSystemUserByEmail(email) : null;

    const result = await approveStoreProfileMedia({
      storeId,
      kinds,
      appliedBySystemUserId: systemUser?.id ?? null,
      verifiedByAuthId: access.user.id,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/profile-media/approve]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
