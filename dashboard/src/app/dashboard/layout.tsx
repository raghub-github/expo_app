"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { HierarchicalSidebar } from "@/components/layout/HierarchicalSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { Header } from "@/components/layout/Header";
import { AuthProvider } from "@/providers/AuthProvider";
import { getCurrentDashboard, getCurrentDashboardSubRoutes } from "@/lib/navigation/dashboard-routes";
import { queryKeys } from "@/lib/queryKeys";
import { fetchPermissions, usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { fetchDashboardAccess, useDashboardAccessQuery } from "@/hooks/queries/useDashboardAccessQuery";

function DashboardLayoutSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-4">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="h-4 w-full max-w-xl rounded bg-gray-100" />
      <div className="h-4 w-full max-w-lg rounded bg-gray-100" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { isLoading: permissionsLoading } = usePermissionsQuery();
  const { isLoading: dashboardAccessLoading } = useDashboardAccessQuery();
  const showSkeleton = permissionsLoading || dashboardAccessLoading;

  useEffect(() => {
    queryClient.prefetchQuery({ queryKey: queryKeys.permissions(), queryFn: fetchPermissions });
    queryClient.prefetchQuery({ queryKey: queryKeys.dashboardAccess(), queryFn: fetchDashboardAccess });
  }, [queryClient]);
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);
  const currentDashboard = useMemo(() => getCurrentDashboard(cleanPathname), [cleanPathname]);
  const currentSubRoutes = useMemo(() => getCurrentDashboardSubRoutes(cleanPathname), [cleanPathname]);
  const isInSpecificDashboard: boolean = Boolean(currentDashboard && cleanPathname !== "/dashboard");
  
  // Check if right sidebar should be available (has sub-routes)
  const hasRightSidebar = useMemo(() => {
    return isInSpecificDashboard && currentSubRoutes.length > 0;
  }, [isInSpecificDashboard, currentSubRoutes.length]);

  // State management: only one sidebar open at a time
  // Initialize based on whether right sidebar is available
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => !hasRightSidebar);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(() => hasRightSidebar);

  // Update sidebar states when navigating between dashboards
  useEffect(() => {
    if (hasRightSidebar) {
      // In specific dashboard with sub-routes: right sidebar open, left sidebar closed (collapsed to 64px)
      setIsRightSidebarOpen(true);
      setIsLeftSidebarOpen(false);
    } else {
      // On main dashboard or dashboard without sub-routes: left sidebar open, right sidebar closed
      setIsLeftSidebarOpen(true);
      setIsRightSidebarOpen(false);
    }
  }, [hasRightSidebar]);

  const handleLeftSidebarToggle = () => {
    setIsLeftSidebarOpen(!isLeftSidebarOpen);
    if (!isLeftSidebarOpen && isRightSidebarOpen) {
      setIsRightSidebarOpen(false); // Close right sidebar when opening left
    }
  };

  const handleRightSidebarToggle = () => {
    setIsRightSidebarOpen(!isRightSidebarOpen);
    if (!isRightSidebarOpen && isLeftSidebarOpen) {
      setIsLeftSidebarOpen(false); // Close left sidebar when opening right
    }
  };

  return (
    <AuthProvider>
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#E6F6F5' }}>
      <HierarchicalSidebar 
        isOpen={isLeftSidebarOpen}
        onToggle={handleLeftSidebarToggle}
        isInSpecificDashboard={isInSpecificDashboard}
      />
      <div 
        className={`flex flex-1 flex-col overflow-hidden transition-all duration-300 w-full ${
          // On mobile (default): no margin (sidebars overlay)
          // On desktop (lg+): add margin based on sidebar state
          // Both sidebars use same width: w-56 (224px) when open, w-16 (64px) when collapsed
          isLeftSidebarOpen 
            ? 'lg:ml-56' // 224px = w-56 (14rem) - left sidebar open on desktop
            : 'lg:ml-16' // 64px = w-16 (4rem) - left sidebar collapsed on desktop
        } ${
          // Right sidebar: only add margin if right sidebar exists and is open
          // If no right sidebar exists, don't add any right margin (full width for main content)
          hasRightSidebar && isRightSidebarOpen 
            ? 'lg:mr-56' // 224px = w-56 (14rem) - right sidebar open on desktop
            : hasRightSidebar && !isRightSidebarOpen
            ? 'lg:mr-16' // 64px = w-16 (4rem) - right sidebar collapsed on desktop
            : '' // No right margin when right sidebar doesn't exist - full width for main content
        }`}
      >
        <Header />
        <div className="flex flex-1 overflow-hidden relative w-full">
          <main 
            className="flex-1 overflow-y-auto p-3 sm:p-4 transition-all duration-300 w-full"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="w-full max-w-full min-w-0">
              {showSkeleton ? <DashboardLayoutSkeleton /> : children}
            </div>
          </main>
          <RightSidebar 
            isOpen={isRightSidebarOpen} 
            onToggle={handleRightSidebarToggle} 
          />
        </div>
      </div>
    </div>
    </AuthProvider>
  );
}
