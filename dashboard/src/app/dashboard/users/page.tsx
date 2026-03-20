"use client";

import { UserList } from "@/components/users/UserList";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { useHydrated } from "@/hooks/useHydrated";

function UsersLoadingShell() {
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full max-w-full overflow-x-auto">
        <div className="text-gray-500">Loading...</div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { isSuperAdmin, loading, exists } = usePermissions();
  const redirectAttemptedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple redirect attempts
    if (redirectAttemptedRef.current) {
      return;
    }

    // Wait for loading to complete and data to exist
    if (loading || !exists) {
      return; // Don't do anything while loading or if user doesn't exist yet
    }
    
    // Only redirect if we've confirmed they're not a super admin AND we have data
    if (!isSuperAdmin) {
      redirectAttemptedRef.current = true;
      router.push("/dashboard");
    }
  }, [loading, isSuperAdmin, exists, router]);

  // Until the client has mounted, match SSR output: persisted RQ cache can make
  // permissions "ready" only on the client and cause a hydration mismatch.
  if (!hydrated) {
    return <UsersLoadingShell />;
  }

  if (loading) {
    return <UsersLoadingShell />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full max-w-full overflow-x-auto">
        <UserList showActions={true} />
      </div>
    </div>
  );
}
