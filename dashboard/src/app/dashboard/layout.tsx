"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { HierarchicalSidebar } from "@/components/layout/HierarchicalSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { Header } from "@/components/layout/Header";
import { AuthProvider } from "@/providers/AuthProvider";
import { RightSidebarProvider } from "@/context/RightSidebarContext";
import { TicketFilterSidebarProvider, useTicketFilterSidebar } from "@/context/TicketFilterSidebarContext";
import { getCurrentDashboard, getCurrentDashboardSubRoutes } from "@/lib/navigation/dashboard-routes";
import { queryKeys } from "@/lib/queryKeys";
import { fetchPermissions, usePermissionsQuery } from "@/hooks/queries/usePermissionsQuery";
import { fetchDashboardAccess, useDashboardAccessQuery } from "@/hooks/queries/useDashboardAccessQuery";
import { TicketFilters } from "@/components/tickets/TicketFilters";

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
      <TicketFilterSidebarProvider>
        <DashboardLayoutContent
          showSkeleton={showSkeleton}
          isLeftSidebarOpen={isLeftSidebarOpen}
          isRightSidebarOpen={isRightSidebarOpen}
          hasRightSidebar={hasRightSidebar}
          handleRightSidebarToggle={handleRightSidebarToggle}
          handleLeftSidebarToggle={handleLeftSidebarToggle}
          isInSpecificDashboard={isInSpecificDashboard}
        >
          {children}
        </DashboardLayoutContent>
      </TicketFilterSidebarProvider>
    </AuthProvider>
  );
}

function DashboardLayoutContent({
  showSkeleton,
  children,
  isLeftSidebarOpen,
  isRightSidebarOpen,
  hasRightSidebar,
  handleRightSidebarToggle,
  handleLeftSidebarToggle,
  isInSpecificDashboard,
}: {
  showSkeleton: boolean;
  children: React.ReactNode;
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  hasRightSidebar: boolean;
  handleRightSidebarToggle: () => void;
  handleLeftSidebarToggle: () => void;
  isInSpecificDashboard: boolean;
}) {
  const pathname = usePathname();
  const filterSidebar = useTicketFilterSidebar();
  const cleanPathname = useMemo(() => pathname.split("?")[0].split("#")[0], [pathname]);
  const isTicketDetailPage = useMemo(
    () => /^\/dashboard\/tickets\/\d+$/.test(cleanPathname),
    [cleanPathname]
  );
  const isFilterSidebarOpen = Boolean(isTicketDetailPage && filterSidebar?.isFilterSidebarOpen);

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: "#E6F6F5" }}>
      <HierarchicalSidebar
        isOpen={isLeftSidebarOpen}
        onToggle={handleLeftSidebarToggle}
        isInSpecificDashboard={isInSpecificDashboard}
      />
      <RightSidebarProvider
        value={{ isOpen: isRightSidebarOpen, onToggle: handleRightSidebarToggle }}
      >
        <div
          className={`flex flex-1 flex-col overflow-hidden transition-all duration-300 w-full ${
            isLeftSidebarOpen ? "lg:ml-56" : "lg:ml-16"
          } ${
            hasRightSidebar && isRightSidebarOpen
              ? isFilterSidebarOpen
                ? "lg:mr-[28rem]"
                : "lg:mr-56"
              : hasRightSidebar && !isRightSidebarOpen
                ? "lg:mr-16"
                : ""
          }`}
        >
          <Header />
          <div className="flex flex-1 overflow-hidden relative w-full">
            <main
              className="flex-1 overflow-y-auto p-3 sm:p-4 transition-all duration-300 w-full"
              style={{ backgroundColor: "#FFFFFF" }}
            >
              <div className="w-full max-w-full min-w-0">
                {showSkeleton ? <DashboardLayoutSkeleton /> : children}
              </div>
            </main>
            <RightSidebar
              isOpen={isRightSidebarOpen}
              onToggle={handleRightSidebarToggle}
              filterSidebarOpen={isFilterSidebarOpen}
            />
            {/* Filters panel: opens to the RIGHT of Properties (rightmost), with slide-in animation */}
            {isTicketDetailPage && (
              <div
                className="fixed top-0 bottom-0 z-50 overflow-hidden transition-[width] duration-300 ease-out"
                style={{
                  right: 0,
                  width: isFilterSidebarOpen ? "14rem" : 0,
                }}
                aria-hidden={!isFilterSidebarOpen}
              >
                <aside
                  className="absolute inset-y-0 right-0 flex h-full w-56 flex-col bg-[#E8F0F2] shadow-xl border-l border-gray-200/80 rounded-l-xl"
                  style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "#9CA3AF #E8F0F2",
                  }}
                  aria-label="Filters"
                >
                  <div className="flex h-12 sm:h-14 items-center justify-between border-b border-gray-300/30 px-3 shrink-0 bg-white/50 rounded-tl-xl">
                    <span className="text-sm font-semibold text-gray-800 tracking-tight">Filters</span>
                    <button
                      type="button"
                      onClick={() => filterSidebar?.closeFilterSidebar()}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-200/80 hover:text-gray-900 transition-colors"
                      aria-label="Close filters"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <TicketFilters variant="sidebar" dark={false} />
                  </div>
                </aside>
              </div>
            )}
          </div>
        </div>
      </RightSidebarProvider>
    </div>
  );
}
