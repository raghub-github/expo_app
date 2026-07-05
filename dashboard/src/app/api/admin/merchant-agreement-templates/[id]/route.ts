import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/require-super-admin-api";
import {
  activateMerchantAgreementTemplate,
  deleteMerchantAgreementTemplate,
  getMerchantAgreementTemplateById,
  updateMerchantAgreementTemplate,
} from "@/lib/db/operations/merchant-agreement-templates";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const gate = await requireSuperAdminApi();
    if (!gate.ok) return gate.response;

    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const template = await getMerchantAgreementTemplateById(id);
    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, template });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const gate = await requireSuperAdminApi();
    if (!gate.ok) return gate.response;

    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "activate") {
      const template = await activateMerchantAgreementTemplate(id, gate.systemUserId);
      if (!template) {
        return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, template });
    }

    const patch: Parameters<typeof updateMerchantAgreementTemplate>[1] = {
      systemUserId: gate.systemUserId,
    };
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.version === "string") patch.version = body.version;
    if (typeof body.contentMarkdown === "string") patch.contentMarkdown = body.contentMarkdown;
    if (body.pdfUrl === null || typeof body.pdfUrl === "string") patch.pdfUrl = body.pdfUrl;
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (typeof body.appliesTo === "object" && body.appliesTo) patch.appliesTo = body.appliesTo;

    const template = await updateMerchantAgreementTemplate(id, patch);
    if (!template) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, template });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const gate = await requireSuperAdminApi();
    if (!gate.ok) return gate.response;

    const { id: idRaw } = await context.params;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const ok = await deleteMerchantAgreementTemplate(id);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
