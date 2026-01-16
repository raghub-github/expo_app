"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { normalizeMobileNumber, formatMobileForDisplay } from "@/lib/utils/mobile-normalizer";
import { DashboardAccessSelector, DASHBOARD_DEFINITIONS } from "./DashboardAccessSelector";
import { SubroleSelector } from "./SubroleSelector";
import { ReportsToSelector } from "./ReportsToSelector";
import { hasSubroles } from "@/lib/roles/subrole-mapping";

interface UserFormProps {
  userId?: number;
  mode: "create" | "edit";
  onSuccess?: () => void;
  onCancel?: () => void;
  isSuperAdmin?: boolean;
  currentUserId?: number | null;
}

const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "AGENT",
  "AREA_MANAGER_MERCHANT",
  "AREA_MANAGER_RIDER",
  "SALES_TEAM",
  "ADVERTISEMENT_TEAM",
  "AUDIT_TEAM",
  "COMPLIANCE_TEAM",
  "SUPPORT_L1",
  "SUPPORT_L2",
  "SUPPORT_L3",
  "FINANCE_TEAM",
  "OPERATIONS_TEAM",
  "DEVELOPER",
  "READ_ONLY",
  "MANAGER",
  "SUPERVISOR",
  "TEAM_LEAD",
  "COORDINATOR",
  "ANALYST",
  "SPECIALIST",
  "CONSULTANT",
  "INTERN",
  "TRAINEE",
  "QA_ENGINEER",
  "PRODUCT_MANAGER",
  "PROJECT_MANAGER",
  "HR_TEAM",
  "MARKETING_TEAM",
  "CUSTOMER_SUCCESS",
  "DATA_ANALYST",
  "BUSINESS_ANALYST",
];

export function UserForm({ userId, mode, onSuccess, onCancel, isSuperAdmin = false, currentUserId = null }: UserFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    system_user_id: "",
    full_name: "",
    first_name: "",
    last_name: "",
    email: "",
    mobile: "",
    alternate_mobile: "",
    primary_role: "",
    subrole: "",
    subrole_other: "",
    role_display_name: "",
    department: "",
    team: "",
    reports_to_id: "",
    manager_name: "",
    status: "",
  });
  const [selectedDashboards, setSelectedDashboards] = useState<string[]>([]);
  const [selectedAccessPoints, setSelectedAccessPoints] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (mode === "edit" && userId) {
      fetchUser();
    }
  }, [mode, userId]);

  // Auto-generate system_user_id when role is selected in create mode
  useEffect(() => {
    if (mode === "create" && formData.primary_role && !formData.system_user_id) {
      const generateId = async () => {
        try {
          const response = await fetch(`/api/users/generate-id?role=${encodeURIComponent(formData.primary_role)}`);
          const result = await response.json();
          
          if (result.success && result.data?.system_user_id) {
            setFormData((prev) => ({ ...prev, system_user_id: result.data.system_user_id }));
          } else {
            console.error("Error generating system user ID:", result.error);
          }
        } catch (error) {
          console.error("Error generating system user ID:", error);
        }
      };
      generateId();
    }
  }, [formData.primary_role, mode]);

  useEffect(() => {
    if (formData.primary_role === "SUPER_ADMIN") {
      const dashboards = Object.keys(DASHBOARD_DEFINITIONS);
      const accessPoints = dashboards.reduce<Record<string, string[]>>((acc, dashboardType) => {
        const accessPointGroups = DASHBOARD_DEFINITIONS[dashboardType as keyof typeof DASHBOARD_DEFINITIONS]
          .accessPoints
          .map((ap) => ap.group);
        acc[dashboardType] = accessPointGroups;
        return acc;
      }, {});

      setSelectedDashboards(dashboards);
      setSelectedAccessPoints(accessPoints);
    }
  }, [formData.primary_role]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${userId}`);
      const result = await response.json();

      if (result.success) {
        const user = result.data;
        setFormData({
          system_user_id: user.systemUserId || "",
          full_name: user.fullName || "",
          first_name: user.firstName || "",
          last_name: user.lastName || "",
          email: user.email || "",
          mobile: user.mobile || "",
          alternate_mobile: user.alternateMobile || "",
          primary_role: user.primaryRole || "",
          subrole: user.subrole || "",
          subrole_other: user.subroleOther || "",
          role_display_name: user.roleDisplayName || "",
          department: user.department || "",
          team: user.team || "",
          reports_to_id: user.reportsToId?.toString() || "",
          manager_name: user.managerName || "",
          status: user.status || "",
        });
        
        // Fetch dashboard access if editing
        if (mode === "edit" && userId && isSuperAdmin) {
          try {
            const accessResponse = await fetch(`/api/users/${userId}/access`);
            const accessResult = await accessResponse.json();
            if (accessResult.success) {
              const dashboards = accessResult.data.dashboards || [];
              const accessPoints: Record<string, string[]> = {};
              
              dashboards.forEach((dash: any) => {
                if (!accessPoints[dash.dashboardType]) {
                  accessPoints[dash.dashboardType] = [];
                }
              });
              
              (accessResult.data.accessPoints || []).forEach((ap: any) => {
                if (!accessPoints[ap.dashboardType]) {
                  accessPoints[ap.dashboardType] = [];
                }
                accessPoints[ap.dashboardType].push(ap.accessPointGroup);
              });
              
              setSelectedDashboards(dashboards.map((d: any) => d.dashboardType));
              setSelectedAccessPoints(accessPoints);
            }
          } catch (err) {
            console.error("Error fetching dashboard access:", err);
          }
        }
      } else {
        setError(result.error || "Failed to fetch user");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  // Check if current user is editing themselves
  const isEditingSelf = mode === "edit" && userId && currentUserId && userId === currentUserId;
  // Check if current user is super admin editing themselves
  const isSuperAdminEditingSelf = isEditingSelf && isSuperAdmin;
  // Allow role change only in create mode, or if super admin is editing someone else (not themselves)
  const canChangeRole = mode === "create" || (mode === "edit" && isSuperAdmin && !isSuperAdminEditingSelf);
  // Allow status change only if super admin is editing someone else (not themselves)
  const canChangeStatus = mode === "edit" && isSuperAdmin && !isSuperAdminEditingSelf;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = mode === "create" ? "/api/users" : `/api/users/${userId}`;
      const method = mode === "create" ? "POST" : "PUT";

      // Normalize mobile numbers before submitting
      const normalizedMobile = normalizeMobileNumber(formData.mobile);
      const normalizedAlternateMobile = formData.alternate_mobile 
        ? normalizeMobileNumber(formData.alternate_mobile) 
        : undefined;

      const payload: any = {
        system_user_id: formData.system_user_id,
        full_name: formData.full_name,
        email: formData.email,
        mobile: normalizedMobile,
      };

      // Only include primary_role if it can be changed
      if (mode === "create" || canChangeRole) {
        payload.primary_role = formData.primary_role;
      }

      if (formData.first_name) payload.first_name = formData.first_name;
      if (formData.last_name) payload.last_name = formData.last_name;
      if (normalizedAlternateMobile) payload.alternate_mobile = normalizedAlternateMobile;
      if (formData.subrole) payload.subrole = formData.subrole;
      if (formData.subrole === "OTHER" && formData.subrole_other) {
        payload.subrole_other = formData.subrole_other;
      }
      if (formData.role_display_name) payload.role_display_name = formData.role_display_name;
      if (formData.department) payload.department = formData.department;
      if (formData.team) payload.team = formData.team;
      if (formData.reports_to_id) payload.reports_to_id = parseInt(formData.reports_to_id);
      if (formData.manager_name) payload.manager_name = formData.manager_name;
      // Only include status if super admin is editing someone else (not themselves)
      if (formData.status && canChangeStatus) {
        payload.status = formData.status;
      }

      // Include dashboard access and access points if super admin
      if (isSuperAdmin) {
        (payload as any).dashboardAccess = selectedDashboards.map(dashboardType => ({
          dashboardType,
          accessLevel: "FULL_ACCESS", // Default to full access, can be customized later
        }));
        (payload as any).accessPoints = Object.entries(selectedAccessPoints).flatMap(
          ([dashboardType, accessPointGroups]) =>
            accessPointGroups.map(accessPointGroup => ({
              dashboardType,
              accessPointGroup,
            }))
        );
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        // If editing, refetch user data to show updated information (including new system_user_id, role, subrole, etc.)
        if (mode === "edit" && userId) {
          try {
            await fetchUser();
          } catch (err) {
            console.error("Error refetching user after update:", err);
          }
        }
        
        if (onSuccess) {
          onSuccess();
        } else {
          router.push("/dashboard/users");
        }
      } else {
        setError(result.error || "Failed to save user");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading && mode === "edit") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading user...</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System User ID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            System User ID *
          </label>
          <input
            type="text"
            required
            value={formData.system_user_id}
            onChange={(e) => setFormData({ ...formData, system_user_id: e.target.value })}
            disabled={mode === "edit" || mode === "create"}
            readOnly={mode === "create"}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 text-gray-900 placeholder-gray-400"
            placeholder="Auto-generated based on role"
          />
        </div>

        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Full Name *
          </label>
          <input
            type="text"
            required
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="John Doe"
          />
        </div>

        {/* First Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            First Name
          </label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="John"
          />
        </div>

        {/* Last Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Last Name
          </label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="Doe"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email *
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="john@example.com"
          />
        </div>

        {/* Mobile */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Mobile *
          </label>
          <input
            type="tel"
            required
            value={formData.mobile}
            onChange={(e) => {
              const input = e.target.value;
              // Normalize on blur, but allow user to type freely
              setFormData({ ...formData, mobile: input });
            }}
            onBlur={(e) => {
              const normalized = normalizeMobileNumber(e.target.value);
              if (normalized && normalized !== e.target.value) {
                setFormData({ ...formData, mobile: normalized });
              }
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="+919876543210 or 9876543210"
          />
          {formData.mobile && (
            <p className="mt-1 text-xs text-gray-500">
              Format: {formatMobileForDisplay(formData.mobile)}
            </p>
          )}
        </div>

        {/* Alternate Mobile */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Alternate Mobile
          </label>
          <input
            type="tel"
            value={formData.alternate_mobile}
            onChange={(e) => {
              const input = e.target.value;
              setFormData({ ...formData, alternate_mobile: input });
            }}
            onBlur={(e) => {
              if (e.target.value) {
                const normalized = normalizeMobileNumber(e.target.value);
                if (normalized !== e.target.value) {
                  setFormData({ ...formData, alternate_mobile: normalized });
                }
              }
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="+919876543211 or 9876543211"
          />
          {formData.alternate_mobile && (
            <p className="mt-1 text-xs text-gray-500">
              Format: {formatMobileForDisplay(formData.alternate_mobile)}
            </p>
          )}
        </div>

        {/* Primary Role */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Primary Role *
            {isSuperAdminEditingSelf && (
              <span className="ml-2 text-xs text-red-600">(Cannot change your own role)</span>
            )}
          </label>
          <select
            required
            value={formData.primary_role}
            onChange={(e) => {
              setFormData({ 
                ...formData, 
                primary_role: e.target.value,
                subrole: "", // Reset subrole when role changes
                subrole_other: "", // Reset subrole_other when role changes
              });
              // Reset system_user_id when role changes in create mode to regenerate
              if (mode === "create") {
                setFormData((prev) => ({ ...prev, system_user_id: "" }));
              }
            }}
            disabled={!canChangeRole}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select Role</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          {isSuperAdminEditingSelf && (
            <p className="mt-1 text-xs text-red-600">
              Super admins cannot change their own role for security reasons. Contact another super admin if you need to change your role.
            </p>
          )}
          {mode === "edit" && !isSuperAdmin && (
            <p className="mt-1 text-xs text-gray-500">
              Only super admins can change user roles.
            </p>
          )}
        </div>

        {/* Subrole */}
        {formData.primary_role && hasSubroles(formData.primary_role) && (
          <div>
            <SubroleSelector
              primaryRole={formData.primary_role}
              value={formData.subrole}
              otherValue={formData.subrole_other}
              onChange={(subrole, subroleOther) => {
                setFormData({ ...formData, subrole, subrole_other: subroleOther });
              }}
              disabled={!canChangeRole}
              required={hasSubroles(formData.primary_role)}
            />
          </div>
        )}

        {/* Role Display Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Role Display Name
          </label>
          <input
            type="text"
            value={formData.role_display_name}
            onChange={(e) => setFormData({ ...formData, role_display_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="Support Agent"
          />
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Department
          </label>
          <input
            type="text"
            value={formData.department}
            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="Support"
          />
        </div>

        {/* Team */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Team
          </label>
          <input
            type="text"
            value={formData.team}
            onChange={(e) => setFormData({ ...formData, team: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="Team A"
          />
        </div>

        {/* Reports To */}
        <div>
          <ReportsToSelector
            value={formData.reports_to_id ? parseInt(formData.reports_to_id) : null}
            onChange={(userId) => {
              setFormData({ ...formData, reports_to_id: userId?.toString() || "" });
            }}
            disabled={loading}
            excludeUserId={mode === "edit" && userId ? userId : null}
          />
        </div>

        {/* Manager Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Manager Name
          </label>
          <input
            type="text"
            value={formData.manager_name}
            onChange={(e) => setFormData({ ...formData, manager_name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400"
            placeholder="Jane Manager"
          />
        </div>

        {/* Status (only in edit mode, for super admin) */}
        {mode === "edit" && isSuperAdmin && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              disabled={!canChangeStatus}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="PENDING_ACTIVATION">Pending Activation</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DISABLED">Disabled</option>
              <option value="LOCKED">Locked</option>
            </select>
            {isSuperAdminEditingSelf && (
              <p className="mt-1 text-xs text-red-600">
                Super admins cannot change their own status for security reasons. Contact another super admin if you need to change your status.
              </p>
            )}
          </div>
        )}

        {/* Dashboard Access (only for super admin) */}
        {isSuperAdmin && (
          <div className="col-span-2">
            <DashboardAccessSelector
              selectedDashboards={selectedDashboards}
              selectedAccessPoints={selectedAccessPoints}
              onDashboardsChange={setSelectedDashboards}
              onAccessPointsChange={(dashboardType, accessPoints) => {
                setSelectedAccessPoints({
                  ...selectedAccessPoints,
                  [dashboardType]: accessPoints,
                });
              }}
              disabled={loading}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-4 pt-4 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <X className="h-4 w-4 inline mr-2" />
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4 inline mr-2" />
          {loading ? "Saving..." : mode === "create" ? "Create User" : "Update User"}
        </button>
      </div>
    </form>
  );
}
