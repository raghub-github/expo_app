import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ProfileNavContextValue = {
  lastProfileSlug: string | null;
  setLastProfileSlug: (slug: string | null) => void;
  /** When true, next focus on a profile inner screen should go back to profile index (set by tab bar on Profile press). */
  openProfileRootOnNextFocus: boolean;
  setOpenProfileRootOnNextFocus: (v: boolean) => void;
  /** Where to return when back is pressed on a cross-tab screen (e.g. Flow hub → Offers). */
  returnRoute: string | null;
  setReturnRoute: (route: string | null) => void;
  clearReturnRoute: () => void;
};

const ProfileNavContext = createContext<ProfileNavContextValue | null>(null);

export function ProfileNavProvider({ children }: { children: ReactNode }) {
  const [lastProfileSlug, setLastProfileSlugState] = useState<string | null>(null);
  const [openProfileRootOnNextFocus, setOpenProfileRootOnNextFocus] = useState(false);
  const [returnRoute, setReturnRouteState] = useState<string | null>(null);

  const setLastProfileSlug = useCallback((slug: string | null) => {
    setLastProfileSlugState(slug);
  }, []);

  const setReturnRoute = useCallback((route: string | null) => {
    setReturnRouteState(route);
  }, []);

  const clearReturnRoute = useCallback(() => {
    setReturnRouteState(null);
  }, []);

  const value = useMemo<ProfileNavContextValue>(
    () => ({
      lastProfileSlug,
      setLastProfileSlug,
      openProfileRootOnNextFocus,
      setOpenProfileRootOnNextFocus,
      returnRoute,
      setReturnRoute,
      clearReturnRoute,
    }),
    [
      lastProfileSlug,
      setLastProfileSlug,
      openProfileRootOnNextFocus,
      returnRoute,
      setReturnRoute,
      clearReturnRoute,
    ]
  );

  return <ProfileNavContext.Provider value={value}>{children}</ProfileNavContext.Provider>;
}

export function useProfileNav(): ProfileNavContextValue {
  const ctx = useContext(ProfileNavContext);
  if (!ctx) {
    throw new Error("useProfileNav must be used within ProfileNavProvider");
  }
  return ctx;
}

