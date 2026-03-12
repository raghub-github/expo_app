import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ProfileNavContextValue = {
  lastProfileSlug: string | null;
  setLastProfileSlug: (slug: string | null) => void;
};

const ProfileNavContext = createContext<ProfileNavContextValue | null>(null);

export function ProfileNavProvider({ children }: { children: ReactNode }) {
  const [lastProfileSlug, setLastProfileSlugState] = useState<string | null>(null);

  const setLastProfileSlug = useCallback((slug: string | null) => {
    setLastProfileSlugState(slug);
  }, []);

  const value = useMemo<ProfileNavContextValue>(
    () => ({
      lastProfileSlug,
      setLastProfileSlug,
    }),
    [lastProfileSlug, setLastProfileSlug]
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

