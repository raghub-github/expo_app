"use client";

import { UserList } from "@/components/users/UserList";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";

export default function UsersPage() {
  const router = useRouter();
  const { isSuperAdmin, loading } = usePermissions();

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      router.push("/dashboard");
    }
  }, [loading, isSuperAdmin, router]);

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        <p className="mt-2 text-gray-600">
          Manage system users, agents, and administrators
        </p>
      </div>
      <UserList showActions={true} />
    </div>
  );
}
