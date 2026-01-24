"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
} from "@/lib/navigation/dashboard-routes";

interface RightSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function RightSidebar({ isOpen, onToggle }: RightSidebarProps) {
  const pathname = usePathname();
  
  // Remove query parameters for comparison
  const cleanPathname = useMemo(() => pathname.split('?')[0].split('#')[0], [pathname]);

  // Get current dashboard
  const currentDashboard = useMemo(
    () => getCurrentDashboard(cleanPathname),
    [cleanPathname]
  );

  // Get sub-routes for current dashboard
  const currentSubRoutes = useMemo(
    () => getCurrentDashboardSubRoutes(cleanPathname),
    [cleanPathname]
  );

  // Check if we're in a specific dashboard (not on home)
  const isInSpecificDashboard = Boolean(currentDashboard && cleanPathname !== "/dashboard");

  // Don't show right sidebar if not in a specific dashboard
  if (!isInSpecificDashboard || !currentSubRoutes.length) {
    return null;
  }

  return (
    <>
      {/* Right Sidebar - Collapsible like left sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex h-screen flex-col bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 shadow-2xl transition-all duration-300 ease-in-out ${
          isOpen ? "w-56" : "w-16"
        }`}
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 #1F2937' }}
      >
        {/* Sidebar Header */}
        <div className="flex h-14 items-center justify-between border-b border-gray-700 px-2">
          {isOpen ? (
            <>
              <div className="flex items-center space-x-2 flex-1">
                {currentDashboard?.icon && (
                  <div className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 p-1.5">
                    <currentDashboard.icon className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-xs font-bold text-white truncate">{currentDashboard?.name}</h2>
                  {/* <p className="text-xs text-gray-400">{currentSubRoutes.length} options</p> */}
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center w-full">
              {currentDashboard?.icon && (
                <div className="rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 p-1.5">
                  <currentDashboard.icon className="h-4 w-4 text-white" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation Content */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {currentSubRoutes.map((route) => {
            const isActive = cleanPathname === route.href || cleanPathname.startsWith(route.href + "/");
            const Icon = route.icon;
            return (
              <Link
                key={route.href}
                href={route.href}
                className={`group relative flex items-center rounded-lg transition-all duration-200 ${
                  isOpen 
                    ? `space-x-2 px-2.5 py-2 text-xs font-medium ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20"
                          : "text-gray-300 hover:bg-gray-800/80 hover:text-white hover:-translate-x-1"
                      }`
                    : `justify-center px-2 py-2.5 ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                          : "text-gray-300 hover:bg-gray-800/80 hover:text-white"
                      }`
                }`}
                title={!isOpen ? route.name : route.description}
              >
                <Icon className={`flex-shrink-0 ${isOpen ? "h-4 w-4" : "h-5 w-5"}`} />
                {isOpen && (
                  <>
                    <span className="flex-1 truncate">{route.name}</span>
                    {isActive && (
                      <div className="absolute right-2 h-2 w-2 rounded-full bg-white animate-pulse shadow-lg shadow-white/50"></div>
                    )}
                  </>
                )}
                {/* Tooltip for collapsed state */}
                {!isOpen && (
                  <div className="absolute right-full mr-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
                    {route.name}
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 border-4 border-transparent border-l-gray-900"></div>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer with Toggle Button */}
        <div className="border-t border-gray-700/50 bg-gray-800/50 backdrop-blur-sm p-2">
          <button
            onClick={onToggle}
            className={`flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-gray-700/80 to-gray-600/80 text-white transition-all hover:from-gray-600 hover:to-gray-500 hover:shadow-lg hover:scale-105 ${
              isOpen ? "space-x-2 px-3 py-2.5" : "p-2.5"
            }`}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            {isOpen && <span className="text-xs font-semibold">Hide</span>}
          </button>
        </div>
      </aside>

      {/* Overlay for mobile - only show when sidebar is open on mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onToggle}
          aria-hidden="true"
        />
      )}
    </>
  );
}
