"use client";

import { UserList } from "@/components/users/UserList";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";

export default function UsersPage() {
  const router = useRouter();
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

  // Show loading state while checking permissions
  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  // Show nothing while redirecting (prevents flash of content)
  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">
          Manage system users, agents, and administrators
        </p>
      </div>
      <div className="w-full max-w-full overflow-x-auto">
        <UserList showActions={true} />
      </div>
    </div>
  );
}
