"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { UserForm } from "@/components/users/UserForm";
import { Edit, ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import { DASHBOARD_DEFINITIONS } from "@/components/users/DashboardAccessSelector";

interface SystemUser {
  id: number;
  systemUserId: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  mobile: string;
  alternateMobile?: string;
  primaryRole: string;
  roleDisplayName?: string;
  department?: string;
  team?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface UserAccessDashboard {
  id: number;
  dashboardType: string;
  accessLevel: string;
  isActive: boolean;
  grantedByName?: string;
  grantedAt?: string;
}

interface UserAccessPoint {
  id: number;
  dashboardType: string;
  accessPointGroup: string;
  accessPointName: string;
  accessPointDescription?: string;
  allowedActions: string[];
  context?: Record<string, any>;
  isActive: boolean;
}

export default function UserDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { isSuperAdmin, systemUserId, loading: permissionsLoading } = usePermissions();
  const userId = parseInt(params.id as string);
  const [user, setUser] = useState<SystemUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessData, setAccessData] = useState<{
    dashboards: UserAccessDashboard[];
    accessPoints: UserAccessPoint[];
  } | null>(null);

  useEffect(() => {
    if (!isNaN(userId) && userId > 0) {
      fetchUser();
    } else {
      setError("Invalid user ID");
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!permissionsLoading && isSuperAdmin && !isNaN(userId) && userId > 0) {
      fetchAccess();
    }
  }, [userId, isSuperAdmin, permissionsLoading]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (isNaN(userId) || userId <= 0) {
        setError("Invalid user ID");
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/users/${userId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to fetch user";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        setError(errorMessage);
        setLoading(false);
        return;
      }

      const result = await response.json();

      if (result.success) {
        setUser(result.data);
      } else {
        setError(result.error || "Failed to fetch user");
      }
    } catch (err) {
      console.error("Error fetching user:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAccess = async () => {
    try {
      setAccessLoading(true);
      setAccessError(null);

      const response = await fetch(`/api/users/${userId}/access`);
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to fetch access";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        setAccessError(errorMessage);
        return;
      }

      const result = await response.json();
      if (result.success) {
        setAccessData(result.data);
      } else {
        setAccessError(result.error || "Failed to fetch access");
      }
    } catch (err) {
      console.error("Error fetching access:", err);
      setAccessError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAccessLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-800",
      SUSPENDED: "bg-yellow-100 text-yellow-800",
      DISABLED: "bg-red-100 text-red-800",
      PENDING_ACTIVATION: "bg-gray-100 text-gray-800",
      LOCKED: "bg-orange-100 text-orange-800",
    };

    return (
      <span
        className={`px-3 py-1 text-sm font-medium rounded-full ${
          statusColors[status] || statusColors.PENDING_ACTIVATION
        }`}
      >
        {status.replace("_", " ")}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading user...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/users"
          className="inline-flex items-center text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error || "User not found"}
        </div>
      </div>
    );
  }

  if (editMode) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit User</h1>
            <p className="mt-2 text-gray-600">Update user information</p>
          </div>
          <button
            onClick={() => setEditMode(false)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <UserForm
            userId={user.id}
            mode="edit"
            isSuperAdmin={isSuperAdmin}
            currentUserId={systemUserId}
            onSuccess={async () => {
              setEditMode(false);
              // Refetch user data to show updated information
              await fetchUser();
              // Also refetch access data if super admin
              if (isSuperAdmin) {
                await fetchAccess();
              }
            }}
            onCancel={() => setEditMode(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/dashboard/users"
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Users
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{user.fullName}</h1>
          <p className="mt-1 text-gray-600">{user.email}</p>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(user.status)}
          {!permissionsLoading && isSuperAdmin && (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Edit className="h-4 w-4" />
              Edit
            </button>
          )}
          {user.status === "PENDING_ACTIVATION" && !permissionsLoading && isSuperAdmin && (
            <button
              onClick={async () => {
                if (confirm("Approve and activate this user?")) {
                  try {
                    const response = await fetch(`/api/users/${user.id}/activate`, {
                      method: "POST",
                    });
                    const result = await response.json();
                    if (result.success) {
                      fetchUser();
                    } else {
                      alert(result.error || "Failed to activate user");
                    }
                  } catch (err) {
                    alert("Error activating user");
                  }
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="h-4 w-4" />
              Approve & Activate
            </button>
          )}
        </div>
      </div>

      {/* User Details */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">User Information</h2>
        </div>
        <div className="px-6 py-4">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <dt className="text-sm font-medium text-gray-500">System User ID</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.systemUserId}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Full Name</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.fullName}</dd>
            </div>
            {user.firstName && (
              <div>
                <dt className="text-sm font-medium text-gray-500">First Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.firstName}</dd>
              </div>
            )}
            {user.lastName && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.lastName}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Mobile</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.mobile}</dd>
            </div>
            {user.alternateMobile && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Alternate Mobile</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.alternateMobile}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">Primary Role</dt>
              <dd className="mt-1 text-sm text-gray-900">{user.primaryRole.replace("_", " ")}</dd>
            </div>
            {user.roleDisplayName && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Role Display Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.roleDisplayName}</dd>
              </div>
            )}
            {user.department && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Department</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.department}</dd>
              </div>
            )}
            {user.team && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Team</dt>
                <dd className="mt-1 text-sm text-gray-900">{user.team}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">Status</dt>
              <dd className="mt-1">{getStatusBadge(user.status)}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Created At</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(user.createdAt).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">Updated At</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(user.updatedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Access Details */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Access & Permissions</h2>
        </div>
        <div className="px-6 py-4 space-y-4">
          {!isSuperAdmin && (
            <p className="text-sm text-gray-500">
              Access details are available to super admins only.
            </p>
          )}
          {isSuperAdmin && accessLoading && (
            <div className="text-sm text-gray-500">Loading access...</div>
          )}
          {isSuperAdmin && accessError && (
            <div className="text-sm text-red-600">{accessError}</div>
          )}
          {isSuperAdmin && !accessLoading && !accessError && accessData && (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Dashboard Access</h3>
                {accessData.dashboards.length === 0 && (
                  <p className="text-sm text-gray-500">No dashboard access assigned.</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {accessData.dashboards.map((dashboard) => {
                    const label =
                      DASHBOARD_DEFINITIONS[
                        dashboard.dashboardType as keyof typeof DASHBOARD_DEFINITIONS
                      ]?.label || dashboard.dashboardType;
                    return (
                      <div
                        key={dashboard.id}
                        className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{label}</div>
                            <div className="text-xs text-gray-600 mt-0.5">
                              {dashboard.accessLevel.replace("_", " ")}
                            </div>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              dashboard.isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {dashboard.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        {dashboard.grantedByName && (
                          <div className="text-xs text-gray-500 mt-1">
                            Granted by {dashboard.grantedByName}
                          </div>
                        )}
                        {dashboard.grantedAt && (
                          <div className="text-xs text-gray-500">
                            Granted at {new Date(dashboard.grantedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-900">Access Points</h3>
                {accessData.accessPoints.length === 0 && (
                  <p className="text-sm text-gray-500">No access points assigned.</p>
                )}
                <div className="space-y-3">
                  {Object.entries(
                    accessData.accessPoints.reduce<Record<string, UserAccessPoint[]>>(
                      (acc, point) => {
                        if (!acc[point.dashboardType]) {
                          acc[point.dashboardType] = [];
                        }
                        acc[point.dashboardType].push(point);
                        return acc;
                      },
                      {}
                    )
                  ).map(([dashboardType, points]) => {
                    const label =
                      DASHBOARD_DEFINITIONS[dashboardType as keyof typeof DASHBOARD_DEFINITIONS]
                        ?.label || dashboardType;
                    return (
                      <div key={dashboardType} className="border border-gray-200 rounded-lg p-3">
                        <div className="text-sm font-medium text-gray-900 mb-2">{label}</div>
                        <div className="space-y-2">
                          {points.map((point) => (
                            <div
                              key={point.id}
                              className="border border-gray-200 rounded-md p-2 bg-gray-50"
                            >
                              <div className="text-xs font-medium text-gray-900">
                                {point.accessPointName}
                              </div>
                              {point.accessPointDescription && (
                                <div className="text-xs text-gray-600 mt-0.5">
                                  {point.accessPointDescription}
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap gap-1">
                                {point.allowedActions.map((action) => (
                                  <span
                                    key={action}
                                    className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded"
                                  >
                                    {action}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
