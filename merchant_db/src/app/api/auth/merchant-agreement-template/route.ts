import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const FALLBACK_TEMPLATE = {
  id: null,
  template_key: "DEFAULT_CHILD_ONBOARDING_AGREEMENT",
  title: "Merchant Partner Agreement",
  version: "v1",
  pdf_url: null,
  content_markdown: `Terms and Conditions - Partnership Plan

1) Onboarding benefits (if any) are valid only within the specified eligibility and timeline.
2) Merchant is responsible for operational readiness, menu accuracy, pricing, and legal compliance.
3) Platform charges, commission, and support fees apply as per active commercial terms.
4) Settlement and payout schedules follow platform policy and applicable law.
5) Merchant shall not use discouraged practices, including pricing disparity and off-platform diversion.
6) Contract terms may vary by city, store type, plan, and operational factors.
7) Merchant agrees to digital acceptance, audit logging, and policy updates communicated by the platform.

By signing digitally, merchant confirms reading and accepting all applicable terms and annexures.`,
};

export async function GET(req: NextRequest) {
  try {
    const storeType = (req.nextUrl.searchParams.get("storeType") || "").toUpperCase();
    const city = req.nextUrl.searchParams.get("city") || "";

    const { data, error } = await supabaseAdmin
      .from("merchant_agreement_templates")
      .select("id, template_key, title, version, content_markdown, pdf_url, is_active, applies_to")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (error || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ success: true, template: FALLBACK_TEMPLATE });
    }

    const matched = data.find((row: any) => {
      const rules = row?.applies_to || {};
      const allowedStoreTypes = Array.isArray(rules?.store_types) ? rules.store_types : [];
      const allowedCities = Array.isArray(rules?.cities) ? rules.cities : [];
      const storeTypeOk =
        allowedStoreTypes.length === 0 ||
        (storeType && allowedStoreTypes.map((v: string) => String(v).toUpperCase()).includes(storeType));
      const cityOk =
        allowedCities.length === 0 ||
        (city && allowedCities.map((v: string) => String(v).toLowerCase()).includes(city.toLowerCase()));
      return storeTypeOk && cityOk;
    });

    const template = matched || data[0];
    return NextResponse.json({
      success: true,
      template: {
        id: template.id,
        template_key: template.template_key || FALLBACK_TEMPLATE.template_key,
        title: template.title || FALLBACK_TEMPLATE.title,
        version: template.version || FALLBACK_TEMPLATE.version,
        content_markdown: template.content_markdown || FALLBACK_TEMPLATE.content_markdown,
        pdf_url: template.pdf_url || null,
      },
    });
  } catch (error) {
    console.error("[merchant-agreement-template][GET]", error);
    return NextResponse.json({ success: true, template: FALLBACK_TEMPLATE });
  }
}

