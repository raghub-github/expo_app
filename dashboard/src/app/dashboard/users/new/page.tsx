"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { UserForm } from "@/components/users/UserForm";
import { usePermissions } from "@/hooks/usePermissions";
import { useHydrated } from "@/hooks/useHydrated";

export default function NewUserPage() {
  const hydrated = useHydrated();
  const { isSuperAdmin, systemUserId, loading } = usePermissions();

  if (!hydrated || loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <Link
        href="/dashboard/users"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to Users
      </Link>
      <div className="bg-white rounded-lg shadow p-6">
        <UserForm mode="create" isSuperAdmin={isSuperAdmin} currentUserId={systemUserId} />
      </div>
    </div>
  );
}
