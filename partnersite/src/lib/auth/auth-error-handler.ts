/**
 * Centralized authentication error handling
 */

export interface AuthError {
  code?: string;
  message?: string;
}

export function isRefreshTokenError(error: AuthError | null): boolean {
  if (!error) return false;
  
  const errorCode = error.code?.toLowerCase() || '';
  const errorMessage = error.message?.toLowerCase() || '';
  
  return (
    errorCode === 'refresh_token_not_found' ||
    errorCode === 'refresh_token_already_used' ||
    errorCode === 'invalid_refresh_token' ||
    errorMessage.includes('invalid refresh token') ||
    errorMessage.includes('refresh token not found') ||
    errorMessage.includes('refresh token already used')
  );
}

export function isSessionExpiredError(error: AuthError | null): boolean {
  if (!error) return false;
  
  const errorCode = error.code?.toLowerCase() || '';
  const errorMessage = error.message?.toLowerCase() || '';
  
  return (
    errorCode === 'session_expired' ||
    errorCode === 'jwt_expired' ||
    errorMessage.includes('session expired') ||
    errorMessage.includes('jwt expired')
  );
}

export function shouldClearSession(error: AuthError | null): boolean {
  return isRefreshTokenError(error) || isSessionExpiredError(error);
}

export function getErrorRedirectPath(error: AuthError | null, currentPath: string): string {
  if (isRefreshTokenError(error)) {
    return `/auth/login?reason=session_invalid&redirect=${encodeURIComponent(currentPath)}`;
  }
  
  if (isSessionExpiredError(error)) {
    return `/auth/login?reason=session_expired&redirect=${encodeURIComponent(currentPath)}`;
  }
  
  return `/auth/login?error=${encodeURIComponent(error?.message || 'Authentication failed')}&redirect=${encodeURIComponent(currentPath)}`;
}

export function logAuthError(context: string, error: AuthError | null, additionalInfo?: any) {
  if (!error) return;
  
  // Ensure error has the expected structure
  const normalizedError: AuthError = {
    code: error.code || undefined,
    message: error.message || 'Unknown error',
  };
  
  console.error(`[${context}] Auth error:`, {
    code: normalizedError.code,
    message: normalizedError.message,
    isRefreshTokenError: isRefreshTokenError(normalizedError),
    isSessionExpiredError: isSessionExpiredError(normalizedError),
    shouldClearSession: shouldClearSession(normalizedError),
    ...additionalInfo,
  });
}