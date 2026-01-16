"use client";

import { UserForm } from "@/components/users/UserForm";
import { usePermissions } from "@/hooks/usePermissions";

export default function NewUserPage() {
  const { isSuperAdmin, systemUserId, loading } = usePermissions();

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Create New User</h1>
        <p className="mt-2 text-gray-600">
          Add a new system user, agent, or administrator
        </p>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <UserForm mode="create" isSuperAdmin={isSuperAdmin} currentUserId={systemUserId} />
      </div>
    </div>
  );
}
