import type { PartnerData } from "@/context/AuthContext";
import { readMerchantJwtStaffClaims } from "./merchantJwtClaims";
import { ROLE_PERMISSION_IDS, type StaffRoleKey } from "./staffPermissions";

function rolePermissions(role: StaffRoleKey): string[] {
  return [...ROLE_PERMISSION_IDS[role]];
}

/** Merge JWT + /me fields so permission gates never default to owner on stale cache. */
export function mergePartnerAccess(
  partner: PartnerData | null | undefined,
  token: string | null | undefined
): PartnerData | null {
  if (!partner) return null;
  const fromJwt = readMerchantJwtStaffClaims(token);
  const accessRole = partner.accessRole ?? fromJwt.accessRole;
  const staffId = partner.staffId !== undefined ? partner.staffId : fromJwt.staffId;
  // Always derive from accessRole when present so client RBAC matches ROLE_PERMISSION_IDS.
  const permissions = accessRole
    ? rolePermissions(accessRole)
    : Array.isArray(partner.permissions) && partner.permissions.length > 0
      ? partner.permissions
      : undefined;

  return {
    ...partner,
    ...(accessRole ? { accessRole } : {}),
    ...(staffId !== undefined ? { staffId } : {}),
    ...(permissions ? { permissions } : {}),
  };
}
