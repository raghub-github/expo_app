import { getSql } from "@/lib/db/client";

export const DEFAULT_MX_AGREEMENT_TEMPLATE_KEY = "DEFAULT_CHILD_ONBOARDING_AGREEMENT";

export type MerchantAgreementTemplateDTO = {
  id: number;
  templateKey: string;
  title: string;
  version: string;
  contentMarkdown: string;
  pdfUrl: string | null;
  appliesTo: Record<string, unknown>;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: number;
  template_key: string;
  title: string;
  version: string;
  content_markdown: string;
  pdf_url: string | null;
  applies_to: Record<string, unknown> | null;
  is_active: boolean;
  effective_from: string | Date;
  effective_to: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapRow(row: Row): MerchantAgreementTemplateDTO {
  return {
    id: Number(row.id),
    templateKey: row.template_key,
    title: row.title,
    version: row.version,
    contentMarkdown: row.content_markdown,
    pdfUrl: row.pdf_url,
    appliesTo: row.applies_to ?? {},
    isActive: Boolean(row.is_active),
    effectiveFrom: new Date(row.effective_from).toISOString(),
    effectiveTo: row.effective_to ? new Date(row.effective_to).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listMerchantAgreementTemplates(
  templateKey = DEFAULT_MX_AGREEMENT_TEMPLATE_KEY
): Promise<MerchantAgreementTemplateDTO[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, template_key, title, version, content_markdown, pdf_url, applies_to,
           is_active, effective_from, effective_to, created_at, updated_at
    FROM merchant_agreement_templates
    WHERE template_key = ${templateKey}
    ORDER BY is_active DESC, updated_at DESC, id DESC
  `) as Row[];
  return rows.map(mapRow);
}

export async function getMerchantAgreementTemplateById(
  id: number
): Promise<MerchantAgreementTemplateDTO | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, template_key, title, version, content_markdown, pdf_url, applies_to,
           is_active, effective_from, effective_to, created_at, updated_at
    FROM merchant_agreement_templates
    WHERE id = ${id}
    LIMIT 1
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function getActiveMerchantAgreementTemplate(
  templateKey = DEFAULT_MX_AGREEMENT_TEMPLATE_KEY
): Promise<MerchantAgreementTemplateDTO | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, template_key, title, version, content_markdown, pdf_url, applies_to,
           is_active, effective_from, effective_to, created_at, updated_at
    FROM merchant_agreement_templates
    WHERE template_key = ${templateKey}
      AND is_active = true
      AND (effective_to IS NULL OR effective_to > now())
    ORDER BY effective_from DESC, updated_at DESC, id DESC
    LIMIT 1
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export type MerchantAgreementTemplateInput = {
  templateKey?: string;
  title: string;
  version: string;
  contentMarkdown: string;
  pdfUrl?: string | null;
  appliesTo?: Record<string, unknown>;
  isActive?: boolean;
  systemUserId?: number | null;
};

export async function createMerchantAgreementTemplate(
  input: MerchantAgreementTemplateInput
): Promise<MerchantAgreementTemplateDTO> {
  const sql = getSql();
  const templateKey = input.templateKey?.trim() || DEFAULT_MX_AGREEMENT_TEMPLATE_KEY;
  const isActive = input.isActive !== false;

  if (isActive) {
    await sql`
      UPDATE merchant_agreement_templates
      SET is_active = false, updated_at = now()
      WHERE template_key = ${templateKey} AND is_active = true
    `;
  }

  const rows = (await sql`
    INSERT INTO merchant_agreement_templates (
      template_key, title, version, content_markdown, pdf_url, applies_to,
      is_active, effective_from, created_by, updated_by
    ) VALUES (
      ${templateKey},
      ${input.title.trim()},
      ${input.version.trim()},
      ${input.contentMarkdown},
      ${input.pdfUrl?.trim() || null},
      ${JSON.stringify(input.appliesTo ?? {})}::jsonb,
      ${isActive},
      now(),
      ${input.systemUserId ?? null},
      ${input.systemUserId ?? null}
    )
    RETURNING id, template_key, title, version, content_markdown, pdf_url, applies_to,
              is_active, effective_from, effective_to, created_at, updated_at
  `) as Row[];

  return mapRow(rows[0]);
}

export async function updateMerchantAgreementTemplate(
  id: number,
  input: Partial<MerchantAgreementTemplateInput> & { systemUserId?: number | null }
): Promise<MerchantAgreementTemplateDTO | null> {
  const existing = await getMerchantAgreementTemplateById(id);
  if (!existing) return null;

  const sql = getSql();
  const title = input.title?.trim() ?? existing.title;
  const version = input.version?.trim() ?? existing.version;
  const contentMarkdown = input.contentMarkdown ?? existing.contentMarkdown;
  const pdfUrl = input.pdfUrl === undefined ? existing.pdfUrl : input.pdfUrl?.trim() || null;
  const appliesTo = input.appliesTo ?? existing.appliesTo;
  const isActive = input.isActive ?? existing.isActive;

  if (isActive && !existing.isActive) {
    await sql`
      UPDATE merchant_agreement_templates
      SET is_active = false, updated_at = now()
      WHERE template_key = ${existing.templateKey} AND is_active = true AND id <> ${id}
    `;
  }

  const rows = (await sql`
    UPDATE merchant_agreement_templates
    SET
      title = ${title},
      version = ${version},
      content_markdown = ${contentMarkdown},
      pdf_url = ${pdfUrl},
      applies_to = ${JSON.stringify(appliesTo)}::jsonb,
      is_active = ${isActive},
      updated_at = now(),
      updated_by = ${input.systemUserId ?? null}
    WHERE id = ${id}
    RETURNING id, template_key, title, version, content_markdown, pdf_url, applies_to,
              is_active, effective_from, effective_to, created_at, updated_at
  `) as Row[];

  return rows[0] ? mapRow(rows[0]) : null;
}

export async function activateMerchantAgreementTemplate(
  id: number,
  systemUserId?: number | null
): Promise<MerchantAgreementTemplateDTO | null> {
  const existing = await getMerchantAgreementTemplateById(id);
  if (!existing) return null;

  const sql = getSql();
  await sql`
    UPDATE merchant_agreement_templates
    SET is_active = false, updated_at = now()
    WHERE template_key = ${existing.templateKey} AND is_active = true
  `;
  const rows = (await sql`
    UPDATE merchant_agreement_templates
    SET is_active = true, effective_from = now(), updated_at = now(), updated_by = ${systemUserId ?? null}
    WHERE id = ${id}
    RETURNING id, template_key, title, version, content_markdown, pdf_url, applies_to,
              is_active, effective_from, effective_to, created_at, updated_at
  `) as Row[];
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function deleteMerchantAgreementTemplate(id: number): Promise<boolean> {
  const existing = await getMerchantAgreementTemplateById(id);
  if (!existing) return false;

  const sql = getSql();
  const acceptanceRows = (await sql`
    SELECT id FROM merchant_store_agreement_acceptances WHERE template_id = ${id} LIMIT 1
  `) as { id: number }[];

  if (acceptanceRows.length > 0) {
    await sql`
      UPDATE merchant_agreement_templates
      SET is_active = false, effective_to = now(), updated_at = now()
      WHERE id = ${id}
    `;
    return true;
  }

  await sql`DELETE FROM merchant_agreement_templates WHERE id = ${id}`;
  return true;
}
