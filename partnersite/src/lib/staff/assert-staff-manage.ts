/**
 * Gate staff management APIs: authenticated merchant/staff with `users` permission
 * and ownership of the selected store.
 */

import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import {
  partnerMissingUserStatus,
  requestHasPartnerAuthCookies,
  resolvePartnerUser,
} from "@/lib/auth/resolve-partner-user";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import {
  normalizeStaffRole,
  partnerHasPermission,
  type MerchantStaffRole,
} from "@/lib/auth/merchant-staff-permissions";
import { cookies } from "next/headers";
import { client as sql } from "@/lib/drizzle";

export type StaffManageOk = {
  ok: true;
  storeIdNum: number;
  parentId: number;
  userId: string;
  accessRole: MerchantStaffRole;
  owner: {
    owner_name: string | null;
    owner_email: string | null;
    registered_phone: string | null;
    parent_name: string | null;
    store_logo: string | null;
  };
};

export type StaffManageResult =
  | StaffManageOk
  | { ok: false; error: string; status: number };

export async function assertStaffManageAccess(
  storeIdParam: string | null
): Promise<StaffManageResult> {
  const gate = await assertStoreAccess(storeIdParam);
  if (!gate.ok) {
    return { ok: false, error: gate.error, status: gate.status };
  }

  const cookieStore = await cookies();
  const reader = {
    get: (name: string) => cookieStore.get(name),
    getAll: () => cookieStore.getAll(),
  };
  const resolved = await resolvePartnerUser({ cookieReader: reader });
  if (!resolved.user?.id) {
    const mapped = partnerMissingUserStatus(
      requestHasPartnerAuthCookies({ cookies: reader }),
      resolved.error
    );
    return { ok: false, error: mapped.error, status: mapped.status };
  }

  const validation = await validateMerchantFromSession({
    id: resolved.user.id,
    email: resolved.user.email ?? null,
    phone: resolved.user.phone ?? null,
  });

  if (!validation.isValid || validation.merchantParentId == null) {
    // Platform staff browsing as support — allow if assertStoreAccess already passed with isPlatformStaff
    if (gate.isPlatformStaff) {
      const parentRows = await sql`
        SELECT parent_id FROM merchant_stores WHERE id = ${gate.storeIdNum} LIMIT 1
      `;
      const parentId = Number((parentRows[0] as { parent_id?: unknown } | undefined)?.parent_id);
      if (!Number.isFinite(parentId) || parentId < 1) {
        return { ok: false, error: "Store parent not found", status: 404 };
      }
      const owners = await sql`
        SELECT owner_name, owner_email, registered_phone, parent_name, store_logo
        FROM merchant_parents WHERE id = ${parentId} LIMIT 1
      `;
      const o = owners[0] as Record<string, unknown> | undefined;
      return {
        ok: true,
        storeIdNum: gate.storeIdNum,
        parentId,
        userId: resolved.user.id,
        accessRole: "OWNER",
        owner: {
          owner_name: o?.owner_name != null ? String(o.owner_name) : null,
          owner_email: o?.owner_email != null ? String(o.owner_email) : null,
          registered_phone: o?.registered_phone != null ? String(o.registered_phone) : null,
          parent_name: o?.parent_name != null ? String(o.parent_name) : null,
          store_logo: o?.store_logo != null ? String(o.store_logo) : null,
        },
      };
    }
    return {
      ok: false,
      error: validation.error ?? "Merchant not found",
      status: 403,
    };
  }

  // Same matrix as merchant app: OWNER/MANAGER have `users`; STAFF does not.
  const accessRole = normalizeStaffRole(validation.accessRole ?? "OWNER");
  const permissions = validation.permissions;
  if (!partnerHasPermission(accessRole, permissions, "users")) {
    return {
      ok: false,
      error: "You do not have permission to manage staff.",
      status: 403,
    };
  }

  // Staff/managers are store-scoped — assertStoreAccess already enforced store match.
  const parentId = Number(validation.merchantParentId);
  const owners = await sql`
    SELECT owner_name, owner_email, registered_phone, parent_name, store_logo
    FROM merchant_parents WHERE id = ${parentId} LIMIT 1
  `;
  const o = owners[0] as Record<string, unknown> | undefined;

  return {
    ok: true,
    storeIdNum: gate.storeIdNum,
    parentId,
    userId: resolved.user.id,
    accessRole,
    owner: {
      owner_name: o?.owner_name != null ? String(o.owner_name) : null,
      owner_email: o?.owner_email != null ? String(o.owner_email) : null,
      registered_phone: o?.registered_phone != null ? String(o.registered_phone) : null,
      parent_name: o?.parent_name != null ? String(o.parent_name) : null,
      store_logo: o?.store_logo != null ? String(o.store_logo) : null,
    },
  };
}

export function toE164In(phone: string): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  const last10 = d.length > 10 ? d.slice(-10) : d;
  return last10.length === 10 ? `+91${last10}` : phone.startsWith("+") ? phone : `+91${last10}`;
}
