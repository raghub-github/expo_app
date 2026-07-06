import { NextRequest, NextResponse } from "next/server";
import {
  getActiveMerchantAgreementTemplateForOnboarding,
} from "@/lib/merchant-agreement-template-server";
import { MERCHANT_AGREEMENT_UNAVAILABLE_MESSAGE } from "@/lib/merchant-agreement-template-constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const storeType = req.nextUrl.searchParams.get("storeType") || "";
    const city = req.nextUrl.searchParams.get("city") || "";

    const template = await getActiveMerchantAgreementTemplateForOnboarding({
      storeType,
      city,
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: MERCHANT_AGREEMENT_UNAVAILABLE_MESSAGE },
        { status: 404 }
      );
    }

    const content = String(template.content_markdown ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { success: false, error: MERCHANT_AGREEMENT_UNAVAILABLE_MESSAGE },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      template: {
        id: template.id,
        template_key: template.template_key,
        title: template.title || "Merchant Partner Agreement",
        version: template.version || "v1",
        content_markdown: content,
        pdf_url: template.pdf_url || null,
      },
    });
  } catch (error) {
    console.error("[merchant-agreement-template][GET]", error);
    return NextResponse.json(
      { success: false, error: "Failed to load agreement template" },
      { status: 500 }
    );
  }
}
