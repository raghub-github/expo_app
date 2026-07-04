import { createClient } from "@supabase/supabase-js";
import { client as pgClient } from "@/lib/drizzle";
import { DEFAULT_MX_AGREEMENT_TEMPLATE_KEY } from "@/lib/merchant-agreement-template-constants";

export type MerchantAgreementTemplateRow = {
  id: number;
  template_key: string;
  title: string;
  version: string;
  content_markdown: string;
  pdf_url: string | null;
  applies_to: Record<string, unknown> | null;
  is_active: boolean;
  updated_at: string | Date;
};

function pickTemplateRow(
  rows: MerchantAgreementTemplateRow[],
  templateKey: string,
  storeType: string,
  city: string
): MerchantAgreementTemplateRow | null {
  if (!rows.length) return null;

  const matchesRules = (row: MerchantAgreementTemplateRow) => {
    if (row.template_key !== templateKey) return false;
    const rules = row.applies_to || {};
    const allowedStoreTypes = Array.isArray(rules.store_types) ? rules.store_types : [];
    const allowedCities = Array.isArray(rules.cities) ? rules.cities : [];
    const storeTypeOk =
      allowedStoreTypes.length === 0 ||
      (storeType &&
        allowedStoreTypes.map((v: unknown) => String(v).toUpperCase()).includes(storeType));
    const cityOk =
      allowedCities.length === 0 ||
      (city && allowedCities.map((v: unknown) => String(v).toLowerCase()).includes(city));
    return storeTypeOk && cityOk;
  };

  return (
    rows.find(matchesRules) ||
    rows.find((r) => r.template_key === templateKey) ||
    rows[0] ||
    null
  );
}

async function loadViaPostgres(): Promise<MerchantAgreementTemplateRow[]> {
  if (!process.env.DATABASE_URL?.trim()) return [];
  const rows = (await pgClient`
    SELECT id, template_key, title, version, content_markdown, pdf_url, applies_to,
           is_active, updated_at
    FROM merchant_agreement_templates
    WHERE is_active = true
      AND (effective_to IS NULL OR effective_to > now())
    ORDER BY effective_from DESC NULLS LAST, updated_at DESC, id DESC
  `) as MerchantAgreementTemplateRow[];
  return Array.isArray(rows) ? rows : [];
}

async function loadViaServiceRole(): Promise<MerchantAgreementTemplateRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return [];

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await db
    .from("merchant_agreement_templates")
    .select("id, template_key, title, version, content_markdown, pdf_url, applies_to, is_active, updated_at")
    .eq("is_active", true)
    .order("effective_from", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[merchant-agreement-template] service-role fetch failed:", error.message);
    return [];
  }

  return (Array.isArray(data) ? data : []) as MerchantAgreementTemplateRow[];
}

export async function getActiveMerchantAgreementTemplateForOnboarding(opts?: {
  storeType?: string;
  city?: string;
  templateKey?: string;
}): Promise<MerchantAgreementTemplateRow | null> {
  const templateKey = opts?.templateKey?.trim() || DEFAULT_MX_AGREEMENT_TEMPLATE_KEY;
  const storeType = (opts?.storeType || "").trim().toUpperCase();
  const city = (opts?.city || "").trim().toLowerCase();

  let rows: MerchantAgreementTemplateRow[] = [];
  try {
    rows = await loadViaPostgres();
  } catch (e) {
    console.error("[merchant-agreement-template] postgres fetch failed:", e);
  }

  if (!rows.length) {
    rows = await loadViaServiceRole();
  }

  return pickTemplateRow(rows, templateKey, storeType, city);
}
