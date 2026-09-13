// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { Redirect, useLocalSearchParams } from "expo-router";
import { useSessionStore } from "@/src/stores/sessionStore";

/** Legacy route — same raise-ticket hub as Profile → Raise Ticket. */
export default function HelpScreen() {
  const params = useLocalSearchParams<{ prelogin?: string }>();
  const hasSession = useSessionStore((s) => Boolean(s.session?.accessToken));
  const forcePrelogin =
    !hasSession &&
    (params.prelogin === "1" || params.prelogin === "true" || params.prelogin == null);

  return (
    <Redirect
      href={{
        pathname: "/raise-ticket",
        params: forcePrelogin ? { prelogin: "1" } : {},
      }}
    />
  );
}
