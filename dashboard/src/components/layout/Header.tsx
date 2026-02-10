"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { usePathname } from "next/navigation";
import { LogOut, User, Bell, Search, ChevronDown } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useSessionQuery, useLogout } from "@/hooks/queries/useAuthQuery";
import { Logo } from "@/components/brand/Logo";
import Link from "next/link";
import { getUserAvatarUrl, getUserInitials } from "@/lib/user-avatar";
import { getCurrentPageName } from "@/lib/navigation/dashboard-routes";
import { DashboardSearch } from "./DashboardSearch";

// Order Search Bar Component
function OrderSearchBar() {
  const [searchType, setSearchType] = useState("Order Id");
  const [searchValue, setSearchValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const MINT_GREEN = "#4EE5C1";

  // All search items from the 3 dashboards
  const searchItems = [
    "Order Id",
    "Merchant Id",
    "Customer Mobile",
    "Third Party Order Id",
    "ONDC Order Id",
    "Client Reference Id",
    "Partner Order Id",
    "Internal Order Id",
    "Rider Mobile",
    "Tracking Order Id",
    "Client Name",
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  const handleSearch = () => {
    // Handle search logic here
    console.log("Search:", searchType, searchValue);
  };

  return (
    <div className="flex items-center w-full max-w-md rounded-lg border" style={{ borderColor: "#D9DCE0" }}>
      {/* Dropdown Section */}
      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg text-xs font-medium text-gray-700 cursor-pointer"
          style={{ backgroundColor: "#F0F2F5" }}
        >
          <span className="whitespace-nowrap">{searchType}</span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-600" />
        </button>
        {showDropdown && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
            {searchItems.map((item) => (
              <button
                key={item}
                onClick={() => {
                  setSearchType(item);
                  setShowDropdown(false);
                }}
                onMouseEnter={() => setHoveredItem(item)}
                onMouseLeave={() => setHoveredItem(null)}
                className="w-full text-left px-3 py-1.5 text-xs cursor-pointer transition-colors"
                style={{
                  color: hoveredItem === item ? "#000000" : "#000000",
                  backgroundColor: hoveredItem === item ? MINT_GREEN : "transparent",
                }}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Input Section */}
      <input
        type="text"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder="Search here..."
        className="flex-1 px-2.5 py-1.5 border-l border-r text-xs focus:outline-none"
        style={{ borderColor: "#D9DCE0" }}
        onKeyPress={(e) => {
          if (e.key === "Enter") {
            handleSearch();
          }
        }}
      />
      
      {/* Search Button */}
      <button
        onClick={handleSearch}
        className="px-2.5 py-1.5 rounded-r-lg flex items-center justify-center cursor-pointer"
        style={{ backgroundColor: MINT_GREEN }}
      >
        <Search className="h-3.5 w-3.5 text-gray-900" />
      </button>
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const pageName = useMemo(() => getCurrentPageName(pathname), [pathname]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { data: sessionData, isLoading } = useSessionQuery();
  const logoutMutation = useLogout();

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const el = userMenuRef.current;
      if (el && !el.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  // Extract user info from session
  const userEmail = sessionData?.session?.user?.email || null;
  const userMetadata = sessionData?.session?.user?.user_metadata || {};
  const userName = userMetadata?.full_name || 
                   userMetadata?.name || 
                   userEmail?.split('@')[0] || 
                   null;

  // Get avatar URL - check multiple sources
  useEffect(() => {
    let isMounted = true;
    let timeoutIds: NodeJS.Timeout[] = [];
    let imageInstances: HTMLImageElement[] = [];

    const cleanup = () => {
      isMounted = false;
      timeoutIds.forEach(id => clearTimeout(id));
      timeoutIds = [];
      imageInstances.forEach(img => {
        img.onload = null;
        img.onerror = null;
      });
      imageInstances = [];
    };

    if (userEmail) {
      // Check Supabase session user data for avatar (from Google OAuth)
      const sessionUser = sessionData?.session?.user;
      
      // Debug: Log available metadata
      if (process.env.NODE_ENV === "development") {
        console.log("[Header] User metadata:", userMetadata);
        console.log("[Header] Session user:", sessionUser);
        console.log("[Header] App metadata:", (sessionUser as any)?.app_metadata);
      }

      // Collect all possible avatar sources
      const possibleAvatarSources = [
        userMetadata?.avatar_url,
        userMetadata?.picture,
        userMetadata?.avatar,
        userMetadata?.avatar_url,
        sessionUser?.user_metadata?.avatar_url,
        sessionUser?.user_metadata?.picture,
        sessionUser?.user_metadata?.avatar,
        // Also check app_metadata which sometimes contains Google profile data
        (sessionUser as any)?.app_metadata?.avatar_url,
        (sessionUser as any)?.app_metadata?.picture,
        // Check raw user object properties
        (sessionUser as any)?.avatar_url,
        (sessionUser as any)?.picture,
      ].filter(Boolean);

      // Try Supabase metadata first (from Google OAuth)
      let urlToTry: string | null = null;
      
      if (possibleAvatarSources.length > 0) {
        urlToTry = possibleAvatarSources[0] as string;
        if (process.env.NODE_ENV === "development") {
          console.log("[Header] Found avatar in metadata:", urlToTry);
        }
      } else {
        // Fall back to Gravatar
        urlToTry = getUserAvatarUrl(userEmail, userMetadata, 40);
        if (process.env.NODE_ENV === "development") {
          console.log("[Header] Using Gravatar:", urlToTry);
        }
      }

      // Helper function to try Gravatar fallback
      const tryGravatarFallback = (email: string, metadata: any, failedUrl: string | null) => {
        if (!isMounted) return;
        
        // Ensure we're in the browser before using Image constructor
        if (typeof window === "undefined" || typeof Image === "undefined") {
          if (isMounted) {
            setAvatarError(true);
            setAvatarUrl(null);
          }
          return;
        }

        const gravatarUrl = getUserAvatarUrl(email, metadata, 40);
        if (gravatarUrl && gravatarUrl !== failedUrl) {
          try {
            const gravatarImg = new window.Image();
            gravatarImg.crossOrigin = "anonymous";
            imageInstances.push(gravatarImg);
            
            const gravatarTimeout = setTimeout(() => {
              if (!isMounted) return;
              gravatarImg.onload = null;
              gravatarImg.onerror = null;
              setAvatarError(true);
              setAvatarUrl(null);
            }, 3000);
            timeoutIds.push(gravatarTimeout);
            
            gravatarImg.onload = () => {
              if (!isMounted) return;
              clearTimeout(gravatarTimeout);
              setAvatarUrl(gravatarUrl);
              setAvatarError(false);
            };
            
            gravatarImg.onerror = () => {
              if (!isMounted) return;
              clearTimeout(gravatarTimeout);
              setAvatarError(true);
              setAvatarUrl(null);
            };
            
            gravatarImg.src = gravatarUrl;
          } catch (error) {
            console.error("[Header] Error creating Image for Gravatar:", error);
            if (isMounted) {
              setAvatarError(true);
              setAvatarUrl(null);
            }
          }
        } else {
          if (isMounted) {
            setAvatarError(true);
            setAvatarUrl(null);
          }
        }
      };

      if (urlToTry) {
        // Ensure we're in the browser before using Image constructor
        if (typeof window === "undefined" || typeof Image === "undefined") {
          if (isMounted) {
            setAvatarError(true);
            setAvatarUrl(null);
          }
          return cleanup;
        }

        try {
          // Verify the image exists by trying to load it with timeout
          const img = new window.Image();
          img.crossOrigin = "anonymous"; // Allow CORS for external images
          imageInstances.push(img);
          
          // Suppress console errors for image loading (429, 404, CORS, etc.)
          const originalError = console.error;
          const suppressErrors = () => {
            console.error = () => {}; // Suppress errors temporarily
          };
          const restoreErrors = () => {
            console.error = originalError;
          };
          
          // Set a timeout to prevent hanging on slow/failed requests (like 429 errors)
          const timeoutId = setTimeout(() => {
            if (!isMounted) return;
            restoreErrors();
            img.onload = null;
            img.onerror = null;
            // Timeout reached (likely 429 or network issue), try Gravatar fallback silently
            tryGravatarFallback(userEmail, userMetadata, urlToTry);
          }, 2000); // 2 second timeout for faster fallback on 429 errors
          timeoutIds.push(timeoutId);
          
          suppressErrors(); // Suppress errors during image load
          
          img.onload = () => {
            if (!isMounted) return;
            restoreErrors();
            clearTimeout(timeoutId);
            setAvatarUrl(urlToTry);
            setAvatarError(false);
          };
          
          img.onerror = () => {
            if (!isMounted) return;
            restoreErrors();
            clearTimeout(timeoutId);
            // Image failed to load (could be 429, 404, CORS, etc.)
            // Silently try Gravatar fallback without logging to reduce console noise
            tryGravatarFallback(userEmail, userMetadata, urlToTry);
          };
          
          img.src = urlToTry;
        } catch (error) {
          // Fallback to Gravatar on error (suppress error logging)
          tryGravatarFallback(userEmail, userMetadata, urlToTry);
        }
      } else {
        // No URL found, try Gravatar directly
        tryGravatarFallback(userEmail, userMetadata, null);
      }
    }

    return cleanup;
  }, [userEmail, userMetadata, sessionData]);

  const openLogoutConfirm = () => {
    setShowDropdown(false);
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = () => {
    setShowLogoutConfirm(false);
    logoutMutation.mutate();
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4 sm:px-6 z-50 relative gap-2 sm:gap-4">
      {/* Mobile: Logo + Page name, Desktop: Just Page name */}
      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-shrink">
        {/* Mobile logo - icon only */}
        <Link href="/dashboard" className="sm:hidden flex-shrink-0">
          <Logo variant="icon-only" size="sm" className="transition-opacity hover:opacity-80" />
        </Link>
        <h2 className="text-base font-semibold text-gray-900 sm:text-lg truncate">{pageName}</h2>
      </div>

      {/* Order Search Bar - Show on orders pages */}
      {pathname.startsWith("/dashboard/orders") ? (
        <div className="hidden lg:flex items-center justify-center flex-1 max-w-xl mx-4">
          <OrderSearchBar />
        </div>
      ) : pathname !== "/dashboard/area-managers" ? (
        <div className="hidden lg:flex items-center justify-center flex-1 max-w-xl mx-4">
          <DashboardSearch compact={true} />
        </div>
      ) : null}

      <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
        <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
          <Bell className="h-5 w-5" />
        </button>

        <div ref={userMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown((prev) => !prev)}
            className="flex items-center space-x-2 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100 min-w-0"
            aria-expanded={showDropdown}
            aria-haspopup="true"
          >
            <div className="flex flex-col items-start min-w-0 max-w-[200px]">
              {isLoading ? (
                <>
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-1" />
                  <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
                </>
              ) : userName ? (
                <>
                  <span className="text-sm font-medium text-gray-900 truncate w-full">{userName}</span>
                  {userEmail && (
                    <span className="text-xs text-gray-500 truncate w-full">{userEmail}</span>
                  )}
                </>
              ) : userEmail ? (
                <span className="text-sm font-medium text-gray-900 truncate w-full">{userEmail}</span>
              ) : (
                <span className="text-sm font-medium">User</span>
              )}
            </div>
            {/* Avatar or Fallback - moved to right side - always reserve space */}
            {isLoading ? (
              <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gray-200 animate-pulse" />
            ) : avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={userName || userEmail || "User"}
                className="h-8 w-8 flex-shrink-0 rounded-full object-cover border border-gray-200"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
                {getUserInitials(userName, userEmail)}
              </div>
            )}
          </button>

          {showDropdown && (
            <div
              className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-gray-900/5 py-1 z-[100]"
              role="menu"
            >
              <div className="py-1">
                <button
                  type="button"
                  onClick={openLogoutConfirm}
                  disabled={logoutMutation.isPending}
                  className="flex w-full items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Sign out confirmation modal */}
      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-desc"
          onClick={handleLogoutCancel}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 sm:p-7">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 text-red-600">
                <LogOut className="h-6 w-6" />
              </div>
              <h2 id="logout-dialog-title" className="text-lg font-semibold text-gray-900 text-center">
                Sign out?
              </h2>
              <p id="logout-dialog-desc" className="mt-2 text-sm text-gray-500 text-center">
                Are you sure you want to sign out? You will need to sign in again to access the dashboard.
              </p>
              <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3 sm:gap-3">
                <button
                  type="button"
                  onClick={handleLogoutCancel}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogoutConfirm}
                  disabled={logoutMutation.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {logoutMutation.isPending ? (
                    <>
                      <LoadingSpinner variant="button" size="sm" />
                      Signing out...
                    </>
                  ) : (
                    <>
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
