import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ProfileNavContextValue = {
  lastProfileSlug: string | null;
  setLastProfileSlug: (slug: string | null) => void;
  /** When true, next focus on a profile inner screen should go back to profile index (set by tab bar on Profile press). */
  openProfileRootOnNextFocus: boolean;
  setOpenProfileRootOnNextFocus: (v: boolean) => void;
};

const ProfileNavContext = createContext<ProfileNavContextValue | null>(null);

export function ProfileNavProvider({ children }: { children: ReactNode }) {
  const [lastProfileSlug, setLastProfileSlugState] = useState<string | null>(null);
  const [openProfileRootOnNextFocus, setOpenProfileRootOnNextFocus] = useState(false);

  const setLastProfileSlug = useCallback((slug: string | null) => {
    setLastProfileSlugState(slug);
  }, []);

  const value = useMemo<ProfileNavContextValue>(
    () => ({
      lastProfileSlug,
      setLastProfileSlug,
      openProfileRootOnNextFocus,
      setOpenProfileRootOnNextFocus,
    }),
    [lastProfileSlug, setLastProfileSlug, openProfileRootOnNextFocus]
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

