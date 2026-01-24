"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { DashboardAccessSelector } from "@/components/users/DashboardAccessSelector";
import { usePermissions } from "@/hooks/usePermissions";

export default function UserAccessPage() {
  const params = useParams();
  const router = useRouter();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [selectedDashboards, setSelectedDashboards] = useState<string[]>([]);
  const [selectedAccessPoints, setSelectedAccessPoints] = useState<Record<string, string[]>>({});

  const userId = params.id as string;

  useEffect(() => {
    if (!isSuperAdmin && !permissionsLoading) {
      router.push("/dashboard/users");
      return;
    }

    if (userId && isSuperAdmin) {
      fetchUserAccess();
    }
  }, [userId, isSuperAdmin, permissionsLoading]);

  const fetchUserAccess = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch user details
      const userResponse = await fetch(`/api/users/${userId}`);
      const userResult = await userResponse.json();

      if (!userResult.success) {
        setError(userResult.error || "Failed to fetch user");
        return;
      }

      setUser(userResult.data);

      // Fetch dashboard access
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
      console.error("Error fetching user access:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isSuperAdmin) {
      setError("Super admin access required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboardAccess: selectedDashboards.map(dashboardType => ({
            dashboardType,
            accessLevel: "FULL_ACCESS",
          })),
          accessPoints: Object.entries(selectedAccessPoints).flatMap(
            ([dashboardType, accessPointGroups]) =>
              accessPointGroups.map(accessPointGroup => ({
                dashboardType,
                accessPointGroup,
              }))
          ),
        }),
      });

      const result = await response.json();

      if (result.success) {
        router.push(`/dashboard/users/${userId}`);
      } else {
        setError(result.error || "Failed to update access");
      }
    } catch (err) {
      console.error("Error saving access:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  if (permissionsLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null; // Will redirect
  }

  if (error && !user) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <button
          onClick={() => router.push(`/dashboard/users/${userId}`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to User Details
        </button>
        <p className="text-sm sm:text-base text-gray-600 mt-1">
          {user?.fullName} ({user?.email})
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
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
          disabled={saving}
        />

        <div className="flex items-center justify-end gap-4 mt-6 pt-6 border-t">
          <button
            onClick={() => router.push(`/dashboard/users/${userId}`)}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
