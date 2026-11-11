import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { partnerHasPermission } from "@/lib/staffPermissions";

/** Redirect once when the signed-in role lacks a capability (no replace loops). */
export function useRequirePartnerPermission(permissionId: string, fallbackHref = "/(tabs)/profile") {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { partner } = useAuth();
  const allowed = partnerHasPermission(partner, permissionId);
  const redirectedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (allowed) {
      redirectedForRef.current = null;
      return;
    }
    const key = `${permissionId}:${fallbackHref}`;
    if (redirectedForRef.current === key) return;
    redirectedForRef.current = key;
    routerRef.current.replace(fallbackHref as never);
  }, [allowed, fallbackHref, permissionId]);

  return allowed;
}
