"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/Logo";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      // #region agent log - DISABLED: Agent log service not available
      // Agent log calls disabled to prevent JSON parsing errors
      // #endregion

      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");
      const next = sessionStorage.getItem("auth_redirect") || "/dashboard";

      if (error) {
        // #region agent log - DISABLED: Agent log service not available
        // Agent log calls disabled to prevent JSON parsing errors
        // #endregion
        router.push(`/login?error=${encodeURIComponent(errorDescription || error)}`);
        return;
      }

      if (code) {
        // #region agent log - DISABLED: Agent log service not available
        // Agent log calls disabled to prevent JSON parsing errors
        // #endregion
        
        // Exchange code for session
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        
        // #region agent log - DISABLED: Agent log service not available
        // Agent log calls disabled to prevent JSON parsing errors
        // #endregion

        if (exchangeError) {
          router.push(`/login?error=${encodeURIComponent(exchangeError.message)}`);
          return;
        }

        if (data.session) {
          // Set cookies on the server so middleware can see the session
          // The set-cookie endpoint will validate the user
          const setCookieResponse = await fetch("/api/auth/set-cookie", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            }),
          });

          if (!setCookieResponse.ok) {
            let errorMessage = "Authentication failed";
            try {
              const contentType = setCookieResponse.headers.get("content-type");
              if (contentType && contentType.includes("application/json")) {
                const errorData = await setCookieResponse.json();
                errorMessage = errorData.error || errorMessage;
              } else {
                const errorText = await setCookieResponse.text();
                errorMessage = errorText || errorMessage;
              }
            } catch (parseError) {
              console.error("Error parsing error response:", parseError);
              // Use default error message
            }
            // Sign out from Supabase if validation failed
            await supabase.auth.signOut();
            router.push(`/login?error=${encodeURIComponent(errorMessage)}`);
            return;
          }

          // #region agent log - DISABLED: Agent log service not available
          // Agent log calls disabled to prevent JSON parsing errors
          // #endregion
          sessionStorage.removeItem("auth_redirect");
          // Use window.location for a hard redirect to ensure cookies are sent
          window.location.href = next;
          return;
        }
      }

      // Try to get existing session
      // #region agent log - DISABLED: Agent log service not available
      // Agent log calls disabled to prevent JSON parsing errors
      // #endregion
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // #region agent log - DISABLED: Agent log service not available
      // Agent log calls disabled to prevent JSON parsing errors
      // #endregion

      if (session) {
        // Set cookies on the server so middleware can see the session
        // The set-cookie endpoint will validate the user
        const setCookieResponse = await fetch("/api/auth/set-cookie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
        });

        if (!setCookieResponse.ok) {
          let errorMessage = "Authentication failed";
          try {
            const contentType = setCookieResponse.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const errorData = await setCookieResponse.json();
              errorMessage = errorData.error || errorMessage;
            } else {
              const errorText = await setCookieResponse.text();
              errorMessage = errorText || errorMessage;
            }
          } catch (parseError) {
            console.error("Error parsing error response:", parseError);
            // Use default error message
          }
          // Sign out from Supabase if validation failed
          await supabase.auth.signOut();
          router.push(`/login?error=${encodeURIComponent(errorMessage)}`);
          return;
        }

        // #region agent log - DISABLED: Agent log service not available
        // Agent log calls disabled to prevent JSON parsing errors
        // #endregion
        sessionStorage.removeItem("auth_redirect");
        router.push(next);
      } else {
        router.push(`/login?error=authentication_failed`);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 px-4">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <Logo variant="full" size="md" className="w-full max-w-[160px] sm:max-w-[200px]" />
        </div>
        <div className="space-y-4">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="text-sm font-medium text-gray-700 sm:text-base">Completing authentication...</p>
          <p className="text-xs text-gray-500 sm:text-sm">Please wait while we sign you in</p>
        </div>
      </div>
    </div>
  );
}
