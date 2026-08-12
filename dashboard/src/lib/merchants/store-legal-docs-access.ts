import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getSystemUserByEmail, resolveSystemUserForSupabaseAuth } from "@/lib/auth/user-mapping";
import { getSql } from "@/lib/db/client";
import { resolveAssignedAreaManagersForStoreVerification } from "@/lib/db/operations/parent-area-managers";
import { getUserAccessPoints, isSuperAdmin } from "@/lib/permissions/engine";
import {
  hasMerchantAdminAccess,
  merchantCanMutate,
  type MerchantAccessPointLike,
} from "@/lib/merchants/merchant-dashboard-access";

const SENSITIVE_DOC_NUMBER_KEYS = [
  "pan_document_number",
  "gst_document_number",
  "aadhaar_document_number",
  "fssai_document_number",
  "trade_license_document_number",
  "drug_license_document_number",
  "shop_establishment_document_number",
  "udyam_document_number",
  "other_document_number",
] as const;

const SENSITIVE_DOC_URL_KEYS = [
  "pan_document_url",
  "gst_document_url",
  "aadhaar_document_url",
  "fssai_document_url",
  "trade_license_document_url",
  "drug_license_document_url",
  "shop_establishment_document_url",
  "udyam_document_url",
  "other_document_url",
] as const;

const SENSITIVE_DOC_HOLDER_KEYS = ["pan_holder_name", "aadhaar_holder_name"] as const;

const SENSITIVE_DOC_EXPIRY_KEYS = [
  "pan_expiry_date",
  "gst_expiry_date",
  "aadhaar_expiry_date",
  "fssai_expiry_date",
  "trade_license_expiry_date",
  "drug_license_expiry_date",
  "shop_establishment_expiry_date",
  "udyam_expiry_date",
  "other_expiry_date",
] as const;

export async function isAreaManagerLinkedToStore(args: {
  areaManagerId: number;
  storeInternalId: number;
  storeAreaManagerId: number | null | undefined;
  parentId?: number | null;
}): Promise<boolean> {
  const amId = Number(args.areaManagerId);
  if (!Number.isFinite(amId)) return false;

  if (
    args.storeAreaManagerId != null &&
    Number.isFinite(Number(args.storeAreaManagerId)) &&
    Number(args.storeAreaManagerId) === amId
  ) {
    return true;
  }

  const assigned = await resolveAssignedAreaManagersForStoreVerification(
    args.storeInternalId,
    args.storeAreaManagerId ?? null
  );
  if (assigned.some((a) => Number(a.id) === amId)) return true;

  if (args.parentId != null && Number.isFinite(Number(args.parentId))) {
    try {
      const sql = getSql();
      const rows = await sql`
        SELECT 1
        FROM parent_area_managers
        WHERE parent_id = ${Number(args.parentId)}
          AND area_manager_id = ${amId}
          AND (store_id IS NULL OR store_id = ${args.storeInternalId})
        LIMIT 1
      `;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

/**
 * View-only agents may see legal docs / agreement only for stores linked to their AM.
 * Super admin, Admin&Merchant, and mutation-capable agents may always see them.
 */
export async function canRevealStoreLegalDocs(args: {
  supabaseAuthId: string;
  email?: string | null;
  store: {
    id: number;
    area_manager_id?: number | null;
    parent_id?: number | null;
  };
}): Promise<boolean> {
  const email = (args.email ?? "").trim();
  if (await isSuperAdmin(args.supabaseAuthId, email)) return true;

  const mapped =
    (await resolveSystemUserForSupabaseAuth(args.supabaseAuthId, email || null)) ??
    (email ? await getSystemUserByEmail(email) : null);
  if (!mapped) return false;

  const accessPoints = (await getUserAccessPoints(
    mapped.id,
    "MERCHANT"
  )) as MerchantAccessPointLike[];

  if (hasMerchantAdminAccess({ accessPoints })) return true;
  // Agents with merchant mutation rights can open legal docs on any store they can access.
  if (merchantCanMutate({ accessPoints })) return true;

  // View-only (MERCHANT_VIEW): only stores linked to this Area Manager.
  const am = await getAreaManagerByUserId(mapped.id);
  if (!am) return false;

  return isAreaManagerLinkedToStore({
    areaManagerId: am.id,
    storeInternalId: args.store.id,
    storeAreaManagerId: args.store.area_manager_id ?? null,
    parentId: args.store.parent_id ?? null,
  });
}

export function redactStoreLegalDocuments(
  docs: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!docs) return null;
  const out: Record<string, unknown> = { ...docs };
  for (const key of SENSITIVE_DOC_NUMBER_KEYS) {
    if (out[key] != null && String(out[key]).trim() !== "") out[key] = "••••••••";
  }
  for (const key of SENSITIVE_DOC_HOLDER_KEYS) {
    if (out[key] != null && String(out[key]).trim() !== "") out[key] = "••••••••";
  }
  for (const key of SENSITIVE_DOC_URL_KEYS) {
    out[key] = null;
  }
  for (const key of SENSITIVE_DOC_EXPIRY_KEYS) {
    if (out[key] != null) out[key] = null;
  }
  return out;
}

export function redactStoreAgreement(
  agreement: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!agreement) return null;
  return {
    ...agreement,
    signer_name: agreement.signer_name ? "••••••••" : agreement.signer_name,
    contract_pdf_url: null,
    contract_url: null,
  };
}

/** Same AM-assignment gate as legal docs — reuse canRevealStoreLegalDocs. */
export const canRevealStoreBankDetails = canRevealStoreLegalDocs;

export function redactStoreBankAccounts(
  accounts: Array<Record<string, unknown>> | null | undefined
): Array<Record<string, unknown>> {
  if (!Array.isArray(accounts) || accounts.length === 0) return [];
  return accounts.map((a) => {
    const out: Record<string, unknown> = { ...a };
    if (out.account_holder_name) out.account_holder_name = "••••••••";
    if (out.account_number) out.account_number = "••••••••";
    if (out.account_number_masked) out.account_number_masked = "••••••••";
    if (out.ifsc_code) out.ifsc_code = "••••••••";
    if (out.bank_name) out.bank_name = "••••••••";
    if (out.branch_name) out.branch_name = "••••••••";
    if (out.upi_id) out.upi_id = "••••••••";
    if (out.bank_proof_document_url) out.bank_proof_document_url = null;
    if (out.cancelled_cheque_url) out.cancelled_cheque_url = null;
    return out;
  });
}
