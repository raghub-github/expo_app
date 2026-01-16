import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";

export default async function SuperAdminPage() {
  await requireSuperAdminAccess();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Super Admin Console</h1>
        <p className="mt-2 text-gray-600">
          Manage users, roles, permissions, and access control
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">Super Admin functionality coming soon...</p>
      </div>
    </div>
  );
}
