"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { HierarchicalSidebar } from "@/components/layout/HierarchicalSidebar";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { Header } from "@/components/layout/Header";
import { getCurrentDashboard, getCurrentDashboardSubRoutes } from "@/lib/navigation/dashboard-routes";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
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
            className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 transition-all duration-300 w-full"
          >
            <div className="w-full max-w-full min-w-0">
              {children}
            </div>
          </main>
          <RightSidebar 
            isOpen={isRightSidebarOpen} 
            onToggle={handleRightSidebarToggle} 
          />
        </div>
      </div>
    </div>
  );
}
