"use client";

import { useState, useEffect } from "react";
import { LogOut, User, Bell } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useSessionQuery, useLogout } from "@/hooks/queries/useAuthQuery";
import { Logo } from "@/components/brand/Logo";
import Link from "next/link";
import { getUserAvatarUrl, getUserInitials } from "@/lib/user-avatar";

export function Header() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const { data: sessionData, isLoading } = useSessionQuery();
  const logoutMutation = useLogout();

  // Extract user info from session
  const userEmail = sessionData?.session?.user?.email || null;
  const userMetadata = sessionData?.session?.user?.user_metadata || {};
  const userName = userMetadata?.full_name || 
                   userMetadata?.name || 
                   userEmail?.split('@')[0] || 
                   null;

  // Get avatar URL - check multiple sources
  useEffect(() => {
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

      if (urlToTry) {
        // Verify the image exists by trying to load it
        const img = new Image();
        img.crossOrigin = "anonymous"; // Allow CORS for external images
        img.onload = () => {
          if (process.env.NODE_ENV === "development") {
            console.log("[Header] Avatar loaded successfully:", urlToTry);
          }
          setAvatarUrl(urlToTry);
          setAvatarError(false);
        };
        img.onerror = () => {
          if (process.env.NODE_ENV === "development") {
            console.log("[Header] Avatar failed to load, trying Gravatar fallback");
          }
          // If first source fails, try Gravatar as fallback
          if (possibleAvatarSources.length > 0) {
            const gravatarUrl = getUserAvatarUrl(userEmail, userMetadata, 40);
            if (gravatarUrl && gravatarUrl !== urlToTry) {
              const gravatarImg = new Image();
              gravatarImg.crossOrigin = "anonymous";
              gravatarImg.onload = () => {
                setAvatarUrl(gravatarUrl);
                setAvatarError(false);
              };
              gravatarImg.onerror = () => {
                setAvatarError(true);
                setAvatarUrl(null);
              };
              gravatarImg.src = gravatarUrl;
            } else {
              setAvatarError(true);
              setAvatarUrl(null);
            }
          } else {
            setAvatarError(true);
            setAvatarUrl(null);
          }
        };
        img.src = urlToTry;
      } else {
        setAvatarUrl(null);
        setAvatarError(true);
      }
    }
  }, [userEmail, userMetadata, sessionData]);

  const handleLogout = async () => {
    setShowDropdown(false); // Close dropdown
    logoutMutation.mutate();
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-white px-4 sm:px-6">
      {/* Mobile: Logo + Dashboard text, Desktop: Just Dashboard text */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Mobile logo - icon only */}
        <Link href="/dashboard" className="sm:hidden">
          <Logo variant="icon-only" size="sm" className="transition-opacity hover:opacity-80" />
        </Link>
        <h2 className="text-base font-semibold text-gray-900 sm:text-lg">Dashboard</h2>
      </div>

      <div className="flex items-center space-x-4">
        <button className="rounded-lg p-2 text-gray-600 hover:bg-gray-100">
          <Bell className="h-5 w-5" />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center space-x-2 rounded-lg px-3 py-2 text-gray-700 hover:bg-gray-100 min-w-0"
          >
            <div className="flex flex-col items-start min-w-0 max-w-[200px]">
              {userName ? (
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
            {/* Avatar or Fallback - moved to right side */}
            {avatarUrl && !avatarError ? (
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
            <div className="absolute right-0 mt-2 w-48 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="flex w-full items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {logoutMutation.isPending ? (
                    <>
                      <LoadingSpinner variant="button" size="sm" />
                      <span>Signing out...</span>
                    </>
                  ) : (
                    <>
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
