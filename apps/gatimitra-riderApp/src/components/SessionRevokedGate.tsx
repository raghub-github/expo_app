import { useEffect, useRef, useState } from "react";
import { router, usePathname } from "expo-router";
import { onSessionRevoked } from "@/src/services/sessionEvents";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { SessionEndedSheet } from "@/src/components/auth/SessionEndedSheet";

function isLoginPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.includes("login");
}

export function SessionRevokedGate() {
  const setSession = useSessionStore((s) => s.setSession);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onSessionRevoked(async (payload) => {
      await useOnboardingStore.getState().bindOwner(null);
      await setSession(null);
      const alreadyOnLogin = isLoginPath(pathnameRef.current);
      if (!alreadyOnLogin) {
        router.replace("/(auth)/login");
      }

      const isTakeover = payload.reason === "device_takeover";
      setNotice({
        title: isTakeover ? "Logged out" : "Session ended",
        message: isTakeover
          ? "Your rider account was signed in on another device. Sign in again to continue."
          : payload.reason === "invalid_token"
            ? "Your login has expired or is no longer valid. Please sign in again."
            : "Your session has ended. Please sign in again.",
      });
    });

    return unsubscribe;
  }, [setSession]);

  return (
    <SessionEndedSheet
      visible={notice != null}
      title={notice?.title ?? "Session ended"}
      message={notice?.message ?? "Your session has ended. Please sign in again."}
      onDismiss={() => setNotice(null)}
    />
  );
}
