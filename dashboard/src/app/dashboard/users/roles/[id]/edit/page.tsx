"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SystemRoleForm } from "@/components/users/SystemRoleForm";
import { usePermissions } from "@/hooks/usePermissions";
import { useHydrated } from "@/hooks/useHydrated";

export default function EditSystemRolePage() {
  const params = useParams();
  const router = useRouter();
  const hydrated = useHydrated();
  const { isSuperAdmin, loading: permsLoading, exists } = usePermissions();
  const redirectAttemptedRef = useRef(false);

  const rawId = params?.id;
  const roleId = typeof rawId === "string" ? parseInt(rawId, 10) : NaN;
  const validId = Number.isFinite(roleId) && roleId > 0;

  useEffect(() => {
    if (!validId) {
      router.replace("/dashboard/users/roles");
    }
  }, [validId, router]);

  useEffect(() => {
    if (redirectAttemptedRef.current) return;
    if (!hydrated || permsLoading || !exists) return;
    if (!isSuperAdmin) {
      redirectAttemptedRef.current = true;
      router.push("/dashboard");
    }
  }, [hydrated, permsLoading, isSuperAdmin, exists, router]);

  if (!validId) {
    return null;
  }

  if (!hydrated || permsLoading) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      <Link
        href="/dashboard/users/roles"
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
        Back to roles
      </Link>
      <div className="rounded-lg bg-white p-6 shadow">
        <SystemRoleForm roleId={roleId} />
      </div>
    </div>
  );
}
