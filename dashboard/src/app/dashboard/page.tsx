"use client";

import { useEffect, useState } from "react";
import { AlertCircle, MapPin } from "lucide-react";
import { ServicePointsMap } from "@/components/map/ServicePointsMap";
import { ServicePointForm } from "@/components/map/ServicePointForm";
import { usePermissions } from "@/hooks/usePermissions";

interface UserPermissions {
  exists: boolean;
  systemUserId?: number;
  isSuperAdmin?: boolean;
  message?: string;
}

export default function DashboardHome() {
  const [loading, setLoading] = useState(true);
  const [userPerms, setUserPerms] = useState<UserPermissions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { isSuperAdmin } = usePermissions();

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/auth/permissions");
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Response is not JSON");
        }
        
        const result = await response.json();

        if (result.success) {
          setUserPerms(result.data);
        } else {
          setError(result.error || "Failed to fetch permissions");
        }
      } catch (err) {
        console.error("Error fetching permissions:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  const handleServicePointCreated = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Service Points Map</h1>
        <p className="mt-2 text-gray-600">
          View and manage GatiMitra service points across India
        </p>
      </div>

      {/* User not in system_users warning */}
      {userPerms && !userPerms.exists && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Account Setup Required
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your account is authenticated but not yet added to the system. 
                Please contact an administrator to complete your account setup.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Error Loading Permissions
              </h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Map Layout - Responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map - Takes 2/3 on desktop, full width on mobile */}
        <div className="lg:col-span-2">
          <div className="h-[400px] sm:h-[500px] md:h-[600px] lg:h-[700px]">
            <ServicePointsMap key={refreshKey} className="h-full w-full" />
          </div>
        </div>

        {/* Sidebar - Stats or Info */}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <MapPin className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Service Points</h3>
                <p className="text-sm text-gray-500">Active locations</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">India</p>
            <p className="text-sm text-gray-600 mt-1">
              GatiMitra service coverage
            </p>
          </div>

          {/* Instructions for super admin */}
          {isSuperAdmin && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h4 className="font-medium text-blue-900 mb-2">Super Admin</h4>
              <p className="text-sm text-blue-700">
                Click the "Add Service Point" button to add new service locations.
                You can use city name or coordinates.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Service Point Form - Only visible to super admin */}
      {isSuperAdmin && <ServicePointForm onSuccess={handleServicePointCreated} />}
    </div>
  );
}
