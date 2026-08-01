/**
 * Client-side authentication error handling
 */

import { createClient } from '@/lib/supabase/client';
import { clearAllAuthData } from './clear-auth-storage';
import { partnerLogoutLocal } from './partner-logout';

export interface ClientAuthError {
  code?: string;
  message?: string;
}

export function isAuthError(error: any): error is ClientAuthError {
  return error && (error.code || error.message);
}

export function shouldSignOut(error: ClientAuthError): boolean {
  const errorCode = error.code?.toLowerCase() || '';
  const errorMessage = error.message?.toLowerCase() || '';

  // Concurrent refresh race — another tab/request already rotated the token. Do not sign out.
  if (
    errorCode === 'refresh_token_already_used' ||
    errorMessage.includes('already used')
  ) {
    return false;
  }

  return (
    errorCode === 'refresh_token_not_found' ||
    errorCode === 'invalid_refresh_token' ||
    errorCode === 'session_invalid' ||
    errorMessage.includes('invalid refresh token') ||
    errorMessage.includes('refresh token not found') ||
    errorMessage.includes('session invalid')
  );
}

export async function handleAuthError(error: ClientAuthError, context?: string) {
  console.error(`[client-auth] ${context || 'Auth error'}:`, error);

  if (shouldSignOut(error)) {
    console.log('[client-auth] Clearing local auth after fatal session error');
    clearAllAuthData();
    await partnerLogoutLocal({ redirectToLogin: true, clearStoreSelection: true });
  }
}

export async function refreshAuthIfNeeded(): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      await handleAuthError(error, 'refresh-check');
      return false;
    }
    
    if (!session) {
      // Don't log this as an error - it's normal when user is not authenticated
      console.log('[client-auth] No session found, user needs to login');
      return false;
    }
    
    // Check if token is close to expiry (within 5 minutes)
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const fiveMinutes = 5 * 60;
    
    if (expiresAt && (expiresAt - now) < fiveMinutes) {
      console.log('[client-auth] Token close to expiry, refreshing...');
      const { error: refreshError } = await supabase.auth.refreshSession();
      
      if (refreshError) {
        await handleAuthError(refreshError, 'refresh-session');
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('[client-auth] Error in refreshAuthIfNeeded:', error);
    return false;
  }
}