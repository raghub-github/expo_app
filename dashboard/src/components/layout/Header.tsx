"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User, Bell, Menu } from "lucide-react";
import { logout, getCurrentUser } from "@/lib/auth/supabase";
import { Logo } from "@/components/brand/Logo";
import Link from "next/link";

export function Header() {
  const router = useRouter();
  const [showDropdown, setShowDropdown] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await getCurrentUser();
        if (user) {
          setUserEmail(user.email || null);
          // Try to get name from user metadata or use email as fallback
          const name = user.user_metadata?.full_name || 
                       user.user_metadata?.name || 
                       user.email?.split('@')[0] || 
                       null;
          setUserName(name);
        }
      } catch (error) {
        console.error("Error fetching user:", error);
      }
    };

    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      setShowDropdown(false); // Close dropdown
      
      // First, clear server-side cookies and session via API
      // This must happen before client-side cleanup to avoid "Auth session missing" error
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      
      // Clear client-side session after server cleanup
      // Even if server call fails, try to clear client-side
      try {
        await logout();
      } catch (clientError) {
        // Ignore client-side errors - server already cleared everything
        console.log("Client-side logout (non-critical):", clientError);
      }
      
      // Always redirect to login, regardless of errors
      router.push("/login");
      router.refresh(); // Force refresh to clear any cached state
    } catch (error) {
      console.error("Logout error:", error);
      // Still try to clear client-side and redirect
      try {
        await logout();
      } catch (e) {
        // Ignore
      }
      router.push("/login");
      router.refresh();
    }
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
            <User className="h-5 w-5 flex-shrink-0" />
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
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
              <div className="py-1">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
