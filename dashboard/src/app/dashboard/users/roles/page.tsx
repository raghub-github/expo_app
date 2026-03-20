"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useHydrated } from "@/hooks/useHydrated";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { SystemRolesListPanel } from "@/components/users/SystemRolesListPanel";

export default function SystemRolesListPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { isSuperAdmin, loading: permsLoading, exists } = usePermissions();
  const redirectAttemptedRef = useRef(false);

  useEffect(() => {
    if (redirectAttemptedRef.current) return;
    if (!hydrated || permsLoading || !exists) return;
    if (!isSuperAdmin) {
      redirectAttemptedRef.current = true;
      router.push("/dashboard");
    }
  }, [hydrated, permsLoading, isSuperAdmin, exists, router]);

  if (!hydrated || permsLoading) {
    return (
      <div className="text-gray-500 py-8">
        <LoadingSpinner size="md" text="Loading…" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      <Link
        href="/dashboard/users"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to Users
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">System roles</h2>
        <Link
          href="/dashboard/users/roles/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          Add role
        </Link>
      </div>

      <SystemRolesListPanel enabled={hydrated && !permsLoading && isSuperAdmin} />
    </div>
  );
}
