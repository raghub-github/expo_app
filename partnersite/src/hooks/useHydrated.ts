import { useEffect, useState } from 'react';

/** True after mount — gate localStorage/sessionStorage reads so SSR HTML matches first client paint. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
