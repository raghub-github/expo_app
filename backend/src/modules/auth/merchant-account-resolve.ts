/**
 * Resolve a merchant-app login phone to either the owner (merchant_parents)
 * or an invited store_staff row. Used by OTP send gate + verify/exchange.
 */

export type ResolvedMerchantOwner = {
  kind: "owner";
  parentId: number;
  parentMerchantId: string;
  parentName: string;
  ownerName: string;
  ownerEmail: string | null;
  brandName: string | null;
  registeredPhone: string;
  accessRole: "OWNER";
  staffId: null;
  storeId: null;
};

export type ResolvedMerchantStaff = {
  kind: "staff";
  parentId: number;
  parentMerchantId: string;
  parentName: string;
  ownerName: string;
  ownerEmail: string | null;
  brandName: string | null;
  registeredPhone: string;
  accessRole: "MANAGER" | "STAFF";
  staffId: number;
  storeId: number;
  staffName: string;
  staffPhone: string;
};

export type ResolvedMerchantAccount = ResolvedMerchantOwner | ResolvedMerchantStaff;

type SqlTag = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
};

function normalizeRole(role: string | null | undefined): "OWNER" | "MANAGER" | "STAFF" {
  const r = String(role ?? "")
    .trim()
    .toUpperCase();
  if (r === "OWNER" || r === "PARTNER") return "OWNER";
  if (r === "MANAGER") return "MANAGER";
  return "STAFF";
}

export async function merchantAccountExistsForEmail(
  sql: SqlTag,
  emailRaw: string
): Promise<boolean> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  try {
    const parents = await sql`
      SELECT 1
      FROM merchant_parents
      WHERE LOWER(TRIM(owner_email)) = ${email}
      LIMIT 1
    `;
    return parents.length > 0;
  } catch {
    return false;
  }
}

export async function merchantAccountExistsForPhone(
  sql: SqlTag,
  phoneE164: string
): Promise<boolean> {
  const normalizedPhone = phoneE164.replace(/\D/g, "");
  const last10 = normalizedPhone.slice(-10);
  try {
    const parents = await sql`
      SELECT 1
      FROM merchant_parents
      WHERE registered_phone = ${phoneE164}
         OR registered_phone_normalized = ${normalizedPhone}
         OR registered_phone LIKE ${"%" + last10}
      LIMIT 1
    `;
    if (parents.length > 0) return true;
  } catch {
    /* fall through to staff */
  }
  try {
    const staff = await sql`
      SELECT 1
      FROM store_staff
      WHERE status = TRUE
        AND (
          phone_number = ${phoneE164}
          OR regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') = ${normalizedPhone}
          OR phone_number LIKE ${"%" + last10}
        )
      LIMIT 1
    `;
    return staff.length > 0;
  } catch {
    return false;
  }
}

export async function resolveMerchantAccountByPhone(
  sql: SqlTag,
  phoneE164: string
): Promise<ResolvedMerchantAccount | null> {
  const normalizedPhone = phoneE164.replace(/\D/g, "");
  const last10 = normalizedPhone.slice(-10);

  const parentRows = await sql`
    SELECT id, parent_merchant_id, parent_name, owner_name, owner_email, brand_name, registered_phone
    FROM merchant_parents
    WHERE registered_phone = ${phoneE164}
       OR registered_phone_normalized = ${normalizedPhone}
       OR registered_phone LIKE ${"%" + last10}
    LIMIT 1
  `;
  const parentRow = parentRows[0];
  if (parentRow) {
    return {
      kind: "owner",
      parentId: Number(parentRow.id),
      parentMerchantId: String(parentRow.parent_merchant_id),
      parentName: String(parentRow.parent_name ?? ""),
      ownerName: String(parentRow.owner_name ?? ""),
      ownerEmail: parentRow.owner_email != null ? String(parentRow.owner_email) : null,
      brandName: parentRow.brand_name != null ? String(parentRow.brand_name) : null,
      registeredPhone: String(parentRow.registered_phone ?? phoneE164),
      accessRole: "OWNER",
      staffId: null,
      storeId: null,
    };
  }

  const staffRows = await sql`
    SELECT ss.id AS staff_id,
           ss.store_id,
           ss.name AS staff_name,
           ss.phone_number AS staff_phone,
           ss.role AS staff_role,
           mp.id AS parent_id,
           mp.parent_merchant_id,
           mp.parent_name,
           mp.owner_name,
           mp.owner_email,
           mp.brand_name,
           mp.registered_phone
    FROM store_staff ss
    INNER JOIN merchant_stores ms ON ms.id = ss.store_id
    INNER JOIN merchant_parents mp ON mp.id = ms.parent_id
    WHERE ss.status = TRUE
      AND (
        ss.phone_number = ${phoneE164}
        OR regexp_replace(COALESCE(ss.phone_number, ''), '\\D', '', 'g') = ${normalizedPhone}
        OR ss.phone_number LIKE ${"%" + last10}
      )
    ORDER BY ss.updated_at DESC NULLS LAST, ss.id DESC
    LIMIT 1
  `;
  const staffRow = staffRows[0];
  if (!staffRow) return null;

  const accessRole = normalizeRole(String(staffRow.staff_role ?? "STAFF"));
  if (accessRole === "OWNER") {
    // Staff row marked OWNER — treat as manager-level store access, not brand owner.
    return {
      kind: "staff",
      parentId: Number(staffRow.parent_id),
      parentMerchantId: String(staffRow.parent_merchant_id),
      parentName: String(staffRow.parent_name ?? ""),
      ownerName: String(staffRow.owner_name ?? ""),
      ownerEmail: staffRow.owner_email != null ? String(staffRow.owner_email) : null,
      brandName: staffRow.brand_name != null ? String(staffRow.brand_name) : null,
      registeredPhone: String(staffRow.registered_phone ?? phoneE164),
      accessRole: "MANAGER",
      staffId: Number(staffRow.staff_id),
      storeId: Number(staffRow.store_id),
      staffName: String(staffRow.staff_name ?? ""),
      staffPhone: String(staffRow.staff_phone ?? phoneE164),
    };
  }

  return {
    kind: "staff",
    parentId: Number(staffRow.parent_id),
    parentMerchantId: String(staffRow.parent_merchant_id),
    parentName: String(staffRow.parent_name ?? ""),
    ownerName: String(staffRow.owner_name ?? ""),
    ownerEmail: staffRow.owner_email != null ? String(staffRow.owner_email) : null,
    brandName: staffRow.brand_name != null ? String(staffRow.brand_name) : null,
    registeredPhone: String(staffRow.registered_phone ?? phoneE164),
    accessRole,
    staffId: Number(staffRow.staff_id),
    storeId: Number(staffRow.store_id),
    staffName: String(staffRow.staff_name ?? ""),
    staffPhone: String(staffRow.staff_phone ?? phoneE164),
  };
}

/** Permission ids granted per access role (must match merchant app staffPermissions). */
export const MERCHANT_ROLE_PERMISSION_IDS: Record<"OWNER" | "MANAGER" | "STAFF", string[]> = {
  OWNER: [
    "home",
    "menu",
    "promo",
    "ads",
    "operations",
    "users",
    "outlet",
    "payouts",
  ],
  MANAGER: [
    "home",
    "menu",
    "promo",
    "operations",
    "users",
    "outlet",
    "payouts",
  ],
  /** Home + order ops / feedback — no catalog, payouts, or marketing. */
  STAFF: ["home", "operations"],
};

export function permissionsForRole(role: "OWNER" | "MANAGER" | "STAFF"): string[] {
  return [...MERCHANT_ROLE_PERMISSION_IDS[role]];
}
