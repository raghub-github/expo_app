import { clearPermissionsCache } from "@/lib/permissions/engine";
import { invalidateBootstrapCache } from "@/lib/auth/bootstrap-cache";

/** After superadmin changes a user's dashboard access, bust server caches for that user. */
export async function invalidateUserAccessCaches(target: {
  supabaseAuthId?: string | null;
  email?: string | null;
}): Promise<void> {
  clearPermissionsCache({
    supabaseAuthId: target.supabaseAuthId,
    email: target.email,
  });
  await invalidateBootstrapCache(target.supabaseAuthId);
}
