import { supabase } from "../supabase/client";
import type { AuthError } from "@supabase/supabase-js";

export interface LoginCredentials {
  email?: string;
  phone?: string;
  password?: string;
  otp?: string;
}

export interface AuthResponse {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Login with email and password
 */
export async function loginWithEmail(
  email: string,
  password: string
): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Request OTP via email
 * Note: To receive OTP codes instead of magic links, configure Supabase Dashboard:
 * Authentication > Email Templates > Magic Link template should be set to send OTP codes
 */
export async function requestEmailOTP(email: string): Promise<AuthResponse> {
  try {
    // Request OTP via email
    // IMPORTANT: To receive OTP codes instead of magic links, you must configure
    // Supabase Dashboard: Authentication > Email Templates > Magic Link template
    // The template should display the OTP code, not a magic link
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      // Do not set emailRedirectTo - this helps ensure OTP codes are sent
      // instead of magic links (though dashboard configuration is still required)
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Request OTP via phone
 */
export async function requestPhoneOTP(phone: string): Promise<AuthResponse> {
  try {
    const { data, error } = await supabase.auth.signInWithOtp({
      phone,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Verify OTP
 */
export async function verifyOTP(
  emailOrPhone: string,
  token: string,
  type: "email" | "phone" = "email"
): Promise<AuthResponse> {
  try {
    // TypeScript requires explicit property names, not computed properties
    const verifyParams = type === "email"
      ? {
          email: emailOrPhone,
          token,
          type: "email" as const,
        }
      : {
          phone: emailOrPhone,
          token,
          type: "sms" as const,
        };

    const { data, error } = await supabase.auth.verifyOtp(verifyParams);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Logout current user
 */
export async function logout(): Promise<AuthResponse> {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get current session
 */
export async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  return user;
}

/**
 * Sign in with Google OAuth
 * This will redirect to Google's OAuth page
 */
export async function signInWithGoogle(
  redirectTo?: string
): Promise<AuthResponse> {
  // #region agent log - DISABLED: Agent log service not available
  // Agent log calls disabled to prevent JSON parsing errors
  // #endregion
  try {
    if (typeof window === "undefined") {
      // #region agent log - DISABLED: Agent log service not available
      // Agent log calls disabled to prevent JSON parsing errors
      // #endregion
      return { success: false, error: "This function must be called from the client" };
    }

    const baseUrl = window.location.origin;
    // Use absolute URL for redirectTo - Supabase requires this
    // IMPORTANT: Remove query params from redirect URL - Supabase doesn't allow them
    // We'll store the next destination in sessionStorage instead
    const redirectUrl = redirectTo || `${baseUrl}/auth/callback`;
    
    // Store the destination in sessionStorage before redirect
    if (typeof window !== "undefined") {
      sessionStorage.setItem("auth_redirect", "/dashboard");
    }
    
    // #region agent log - DISABLED: Agent log service not available
    // Agent log calls disabled to prevent JSON parsing errors
    // #endregion
    
    console.log("[signInWithGoogle] Initiating OAuth");
    console.log("[signInWithGoogle] Redirect URL:", redirectUrl);
    console.log("[signInWithGoogle] Base URL:", baseUrl);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
    });

    // #region agent log - DISABLED: Agent log service not available
    // Agent log calls disabled to prevent JSON parsing errors
    // #endregion

    if (error) {
      console.error("[signInWithGoogle] OAuth error:", error);
      return { success: false, error: error.message };
    }

    if (data?.url) {
      console.log("[signInWithGoogle] Redirecting to Supabase OAuth:", data.url.substring(0, 100) + "...");
      // #region agent log - DISABLED: Agent log service not available
      // Agent log calls disabled to prevent JSON parsing errors
      // #endregion
      // The redirect happens automatically via window.location
    }

    // OAuth redirects automatically, so we return success
    // #region agent log - DISABLED: Agent log service not available
    // Agent log calls disabled to prevent JSON parsing errors
    // #endregion
    return { success: true, data };
  } catch (error) {
    console.error("[signInWithGoogle] Exception:", error);
    // #region agent log - DISABLED: Agent log service not available
    // Agent log calls disabled to prevent JSON parsing errors
    // #endregion
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
