"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { UserForm } from "@/components/users/UserForm";
import { Edit, ArrowLeft, CheckCircle, XCircle, User, Mail, Phone, Shield, Building, Users, Clock, Lock, AlertCircle, CheckCircle2, XCircle as XCircleIcon, Calendar, UserCheck, UserX } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import Link from "next/link";
import { usePermissions } from "@/hooks/usePermissions";
import { DASHBOARD_DEFINITIONS } from "@/components/users/DashboardAccessSelector";

interface ReportsToUser {
  id: number;
  systemUserId: string;
  fullName: string;
  primaryRole: string;
}

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
  subrole?: string;
  subroleOther?: string;
  roleDisplayName?: string;
  department?: string;
  team?: string;
  reportsToId?: number;
  reportsTo?: ReportsToUser;
  managerName?: string;
  status: string;
  statusReason?: string;
  suspensionExpiresAt?: string | null;
  isEmailVerified?: boolean;
  isMobileVerified?: boolean;
  twoFactorEnabled?: boolean;
  lastLoginAt?: string | null;
  lastActivityAt?: string | null;
  loginCount?: number;
  failedLoginAttempts?: number;
  accountLockedUntil?: string | null;
  createdBy?: number;
  createdByName?: string;
  approvedBy?: number;
  approvedAt?: string | null;
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
  const [activating, setActivating] = useState(false);
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
            <LoadingButton
              onClick={async () => {
                if (confirm("Approve and activate this user?")) {
                  setActivating(true);
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
                  } finally {
                    setActivating(false);
                  }
                }
              }}
              loading={activating}
              loadingText="Activating..."
              variant="primary"
              size="md"
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-4 w-4" />
              Approve & Activate
            </LoadingButton>
          )}
        </div>
      </div>

      {/* User Details - Compact Table Layout */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 border-b border-blue-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <User className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">User Information</h2>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-600" />
                  Basic Information
                </h3>
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                  <div className="px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">System User ID</span>
                    <span className="text-sm font-mono font-semibold text-gray-900">{user.systemUserId}</span>
                  </div>
                  <div className="px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Full Name</span>
                    <span className="text-sm font-semibold text-gray-900">{user.fullName}</span>
                  </div>
                  {user.firstName && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">First Name</span>
                      <span className="text-sm text-gray-900">{user.firstName}</span>
                    </div>
                  )}
                  {user.lastName && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Last Name</span>
                      <span className="text-sm text-gray-900">{user.lastName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Contact Information */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-green-600" />
                  Contact Information
                </h3>
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                  <div className="px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      Email
                      {user.isEmailVerified && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    </span>
                    <span className="text-sm text-gray-900">{user.email}</span>
                  </div>
                  <div className="px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600 flex items-center gap-2">
                      Mobile
                      {user.isMobileVerified && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    </span>
                    <span className="text-sm text-gray-900">{user.mobile}</span>
                  </div>
                  {user.alternateMobile && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Alternate Mobile</span>
                      <span className="text-sm text-gray-900">{user.alternateMobile}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Role & Organization */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-indigo-600" />
                  Role & Organization
                </h3>
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                  <div className="px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Primary Role</span>
                    <span className="text-sm font-semibold text-gray-900">{user.primaryRole.replace(/_/g, " ")}</span>
                  </div>
                  {user.subrole && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Subrole</span>
                      <span className="text-sm text-gray-900">
                        {user.subrole === "OTHER" ? user.subroleOther : user.subrole}
                      </span>
                    </div>
                  )}
                  {user.roleDisplayName && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Role Display Name</span>
                      <span className="text-sm text-gray-900">{user.roleDisplayName}</span>
                    </div>
                  )}
                  {user.department && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        Department
                      </span>
                      <span className="text-sm text-gray-900">{user.department}</span>
                    </div>
                  )}
                  {user.team && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        Team
                      </span>
                      <span className="text-sm text-gray-900">{user.team}</span>
                    </div>
                  )}
                  {user.reportsToId && (
                    <div className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-600 block mb-1">Reports To</span>
                      {user.reportsTo ? (
                        <div className="text-right space-y-0.5">
                          <div className="text-sm font-semibold text-gray-900">{user.reportsTo.fullName}</div>
                          <div className="text-xs text-gray-600">
                            {user.reportsTo.primaryRole.replace(/_/g, " ")} • {user.reportsTo.systemUserId}
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">ID: #{user.reportsToId}</span>
                      )}
                    </div>
                  )}
                  {user.managerName && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Manager Name</span>
                      <span className="text-sm font-semibold text-gray-900">{user.managerName}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Status & Security */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-purple-600" />
                  Status & Security
                </h3>
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                  <div className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-600 block mb-2">Status</span>
                    <div className="flex items-center justify-between">
                      {getStatusBadge(user.status)}
                      {user.statusReason && (
                        <span className="text-xs text-gray-500 italic ml-2">({user.statusReason})</span>
                      )}
                    </div>
                    {user.suspensionExpiresAt && user.status === "SUSPENDED" && (
                      <div className="mt-2 text-xs text-gray-600">
                        Expires: {new Date(user.suspensionExpiresAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-600 block mb-2">Verification Status</span>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Email Verified</span>
                        {user.isEmailVerified ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircleIcon className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">Mobile Verified</span>
                        {user.isMobileVerified ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircleIcon className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-600">2FA Enabled</span>
                        {user.twoFactorEnabled ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircleIcon className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <span className="text-sm font-medium text-gray-600 block mb-2">Account Security</span>
                    <div className="space-y-2">
                      {user.loginCount !== undefined && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">Login Count</span>
                          <span className="text-xs font-semibold text-gray-900">{user.loginCount}</span>
                        </div>
                      )}
                      {user.failedLoginAttempts !== undefined && user.failedLoginAttempts > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">Failed Attempts</span>
                          <span className="text-xs font-semibold text-red-600">{user.failedLoginAttempts}</span>
                        </div>
                      )}
                      {user.accountLockedUntil && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">Locked Until</span>
                          <span className="text-xs font-semibold text-orange-600">
                            {new Date(user.accountLockedUntil).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity & Timestamps */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  Activity & Timestamps
                </h3>
                <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                  {user.lastLoginAt && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                        <UserCheck className="h-3 w-3" />
                        Last Login
                      </span>
                      <span className="text-sm text-gray-900">
                        {new Date(user.lastLoginAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {user.lastActivityAt && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Last Activity</span>
                      <span className="text-sm text-gray-900">
                        {new Date(user.lastActivityAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Created At
                    </span>
                    <div className="text-right">
                      <div className="text-sm text-gray-900">
                        {new Date(user.createdAt).toLocaleString()}
                      </div>
                      {user.createdByName && (
                        <div className="text-xs text-gray-500">by {user.createdByName}</div>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3 flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Updated At</span>
                    <span className="text-sm text-gray-900">
                      {new Date(user.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  {user.approvedAt && (
                    <div className="px-4 py-3 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Approved At
                      </span>
                      <span className="text-sm text-gray-900">
                        {new Date(user.approvedAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Access Details - Enhanced Styling */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-5 border-b border-purple-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Access & Permissions</h2>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {!isSuperAdmin && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <p className="text-sm font-medium text-yellow-800">
                  Access details are available to super admins only.
                </p>
              </div>
            </div>
          )}
          {isSuperAdmin && accessLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-gray-500">Loading access information...</div>
            </div>
          )}
          {isSuperAdmin && accessError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <p className="text-sm font-medium text-red-800">{accessError}</p>
              </div>
            </div>
          )}
          {isSuperAdmin && !accessLoading && !accessError && accessData && (
            <div className="space-y-8">
              {/* Dashboard Access */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Building className="h-5 w-5 text-purple-600" />
                  Dashboard Access
                </h3>
                {accessData.dashboards.length === 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                    <p className="text-sm text-gray-500">No dashboard access assigned.</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {accessData.dashboards.map((dashboard) => {
                    const label =
                      DASHBOARD_DEFINITIONS[
                        dashboard.dashboardType as keyof typeof DASHBOARD_DEFINITIONS
                      ]?.label || dashboard.dashboardType;
                    return (
                      <div
                        key={dashboard.id}
                        className={`rounded-xl p-4 border-2 transition-all hover:shadow-md ${
                          dashboard.isActive
                            ? "bg-gradient-to-br from-green-50 to-green-100 border-green-300"
                            : "bg-gradient-to-br from-gray-50 to-gray-100 border-gray-300"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="text-sm font-bold text-gray-900 mb-1">{label}</div>
                            <div className="text-xs font-medium text-gray-600 mb-2">
                              {dashboard.accessLevel.replace(/_/g, " ")}
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                              dashboard.isActive
                                ? "bg-green-500 text-white"
                                : "bg-gray-400 text-white"
                            }`}
                          >
                            {dashboard.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                        {(dashboard.grantedByName || dashboard.grantedAt) && (
                          <div className="pt-3 border-t border-gray-300 space-y-1">
                            {dashboard.grantedByName && (
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">Granted by:</span> {dashboard.grantedByName}
                              </div>
                            )}
                            {dashboard.grantedAt && (
                              <div className="text-xs text-gray-600">
                                <span className="font-medium">Date:</span> {new Date(dashboard.grantedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Access Points */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-600" />
                  Access Points
                </h3>
                {accessData.accessPoints.length === 0 && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                    <p className="text-sm text-gray-500">No access points assigned.</p>
                  </div>
                )}
                <div className="space-y-4">
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
                      <div key={dashboardType} className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-5 border-2 border-purple-200">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="p-1.5 bg-purple-600 rounded-lg">
                            <Shield className="h-4 w-4 text-white" />
                          </div>
                          <h4 className="text-sm font-bold text-gray-900">{label}</h4>
                          <span className="ml-auto text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-1 rounded">
                            {points.length} {points.length === 1 ? "point" : "points"}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {points.map((point) => (
                            <div
                              key={point.id}
                              className={`rounded-lg p-3 border-2 transition-all ${
                                point.isActive
                                  ? "bg-white border-blue-300 shadow-sm"
                                  : "bg-gray-50 border-gray-300"
                              }`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <div className="text-xs font-bold text-gray-900 mb-1">
                                    {point.accessPointName}
                                  </div>
                                  {point.accessPointDescription && (
                                    <div className="text-xs text-gray-600 leading-relaxed">
                                      {point.accessPointDescription}
                                    </div>
                                  )}
                                </div>
                                {point.isActive ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 ml-2" />
                                ) : (
                                  <XCircleIcon className="h-4 w-4 text-gray-400 flex-shrink-0 ml-2" />
                                )}
                              </div>
                              {point.allowedActions && point.allowedActions.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                  <div className="text-xs font-semibold text-gray-600 mb-1.5">Allowed Actions:</div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {point.allowedActions.map((action) => (
                                      <span
                                        key={action}
                                        className="text-xs font-medium px-2 py-0.5 bg-blue-100 text-blue-700 rounded-md border border-blue-200"
                                      >
                                        {action}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
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
