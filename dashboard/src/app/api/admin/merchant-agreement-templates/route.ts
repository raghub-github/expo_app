import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/require-super-admin-api";
import {
  createMerchantAgreementTemplate,
  DEFAULT_MX_AGREEMENT_TEMPLATE_KEY,
  getActiveMerchantAgreementTemplate,
  listMerchantAgreementTemplates,
} from "@/lib/db/operations/merchant-agreement-templates";
import { apiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireSuperAdminApi();
    if (!gate.ok) return gate.response;

    const templateKey =
      request.nextUrl.searchParams.get("templateKey")?.trim() || DEFAULT_MX_AGREEMENT_TEMPLATE_KEY;
    const [templates, active] = await Promise.all([
      listMerchantAgreementTemplates(templateKey),
      getActiveMerchantAgreementTemplate(templateKey),
    ]);

    return NextResponse.json({ success: true, templates, active });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireSuperAdminApi();
    if (!gate.ok) return gate.response;

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const version = typeof body.version === "string" ? body.version.trim() : "";
    const contentMarkdown = typeof body.contentMarkdown === "string" ? body.contentMarkdown : "";
    if (!title || !version || !contentMarkdown.trim()) {
      return NextResponse.json(
        { success: false, error: "title, version, and contentMarkdown are required" },
        { status: 400 }
      );
    }

    const created = await createMerchantAgreementTemplate({
      templateKey:
        typeof body.templateKey === "string" ? body.templateKey.trim() : DEFAULT_MX_AGREEMENT_TEMPLATE_KEY,
      title,
      version,
      contentMarkdown,
      pdfUrl: typeof body.pdfUrl === "string" ? body.pdfUrl.trim() : null,
      appliesTo: typeof body.appliesTo === "object" && body.appliesTo ? body.appliesTo : {},
      isActive: body.isActive !== false,
      systemUserId: gate.systemUserId,
    });

    return NextResponse.json({ success: true, template: created });
  } catch (error) {
    const { body, status } = apiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
