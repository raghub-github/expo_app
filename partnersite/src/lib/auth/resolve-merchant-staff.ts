import { client as pgClient } from "@/lib/drizzle";
import {
  permissionsForMerchantRole,
  type MerchantStaffRole,
} from "@/lib/auth/merchant-staff-permissions";

export type ResolvedStoreStaff = {
  accessRole: "MANAGER" | "STAFF";
  staffId: number;
  storeId: number;
  parentId: number;
  parentMerchantId: string;
  ownerEmail?: string;
  registeredPhone?: string;
  permissions: string[];
};

function normalizeRole(role: string | null | undefined): "MANAGER" | "STAFF" {
  const r = String(role ?? "")
    .trim()
    .toUpperCase();
  if (r === "OWNER" || r === "PARTNER" || r === "MANAGER") return "MANAGER";
  return "STAFF";
}

function normalizePhoneForLookup(phone: string): { e164: string; tenDigit: string } {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length > 10 ? digits.slice(-10) : digits;
  const tenDigit = ten.length === 10 ? ten : "";
  const e164 = tenDigit ? `+91${tenDigit}` : phone.startsWith("+") ? phone : "";
  return { e164, tenDigit };
}

export async function resolveStoreStaffByPhone(phone: string): Promise<ResolvedStoreStaff | null> {
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const { e164, tenDigit } = normalizePhoneForLookup(trimmed);
  const normalized = trimmed.replace(/\D/g, "");

  try {
    const rows = await pgClient`
      SELECT ss.id AS staff_id,
             ss.store_id,
             ss.role AS staff_role,
             mp.id AS parent_id,
             mp.parent_merchant_id,
             mp.owner_email,
             mp.registered_phone
      FROM store_staff ss
      INNER JOIN merchant_stores ms ON ms.id = ss.store_id
      INNER JOIN merchant_parents mp ON mp.id = ms.parent_id
      WHERE ss.status = TRUE
        AND (
          ss.phone_number = ${trimmed}
          OR ss.phone_number = ${e164}
          OR regexp_replace(COALESCE(ss.phone_number, ''), '\\D', '', 'g') = ${normalized}
          OR (${tenDigit} <> '' AND ss.phone_number LIKE ${"%" + tenDigit})
        )
      ORDER BY ss.updated_at DESC NULLS LAST, ss.id DESC
      LIMIT 1
    `;
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;

    const accessRole = normalizeRole(String(row.staff_role ?? "STAFF"));
    return {
      accessRole,
      staffId: Number(row.staff_id),
      storeId: Number(row.store_id),
      parentId: Number(row.parent_id),
      parentMerchantId: String(row.parent_merchant_id),
      ownerEmail: row.owner_email != null ? String(row.owner_email) : undefined,
      registeredPhone: row.registered_phone != null ? String(row.registered_phone) : undefined,
      permissions: permissionsForMerchantRole(accessRole),
    };
  } catch (e) {
    console.error("[resolveStoreStaffByPhone] error:", e);
    return null;
  }
}

export function merchantStaffRoleOrOwner(
  accessRole?: MerchantStaffRole | null
): MerchantStaffRole {
  if (accessRole === "MANAGER" || accessRole === "STAFF") return accessRole;
  return "OWNER";
}
