/**
 * Utility to clear Supabase authentication storage.
 * Use clearSupabaseClientSession() on login page load to avoid stale sessions conflicting with OAuth.
 */

/** Clear only Supabase client keys (sb-*) so auth_redirect and other app state are preserved. */
export function clearSupabaseClientSession() {
  if (typeof window === 'undefined') return;
  try {
    ['localStorage', 'sessionStorage'].forEach((storeName) => {
      const store = storeName === 'localStorage' ? localStorage : sessionStorage;
      Object.keys(store).forEach((key) => {
        if (key.startsWith('sb-')) store.removeItem(key);
      });
    });
  } catch (error) {
    console.error('[clear-auth-storage] Error clearing Supabase session:', error);
  }
}

export function clearAuthStorage() {
  if (typeof window === 'undefined') return;

  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth')) {
        localStorage.removeItem(key);
      }
    });

    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth')) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('[clear-auth-storage] Error clearing storage:', error);
  }
}

export function clearAuthCookies() {
  if (typeof document === 'undefined') return;

  try {
    // Get all cookies
    const cookies = document.cookie.split(';');
    
    cookies.forEach(cookie => {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      
      // Clear Supabase auth cookies
      if (name.startsWith('sb-') || name.includes('supabase') || name.includes('auth')) {
        // Clear for current domain
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${window.location.hostname}`;
      }
    });

    console.log('[clear-auth-storage] Cleared auth cookies');
  } catch (error) {
    console.error('[clear-auth-storage] Error clearing cookies:', error);
  }
}

export function clearAllAuthData() {
  clearAuthStorage();
  clearAuthCookies();
}