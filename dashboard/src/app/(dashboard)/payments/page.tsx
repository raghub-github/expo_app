"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";

export default function PaymentsPage() {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payment & Withdrawal Management</h1>
        <p className="mt-2 text-gray-600">
          Manage rider and merchant withdrawals and payments
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Payment management functionality coming soon...</p>
      </div>
    </div>
  );
}
