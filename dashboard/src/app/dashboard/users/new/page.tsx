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
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="w-full">
        <p className="text-sm sm:text-base text-gray-600">
          Add a new system user, agent, or administrator
        </p>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <UserForm mode="create" isSuperAdmin={isSuperAdmin} currentUserId={systemUserId} />
      </div>
    </div>
  );
}
