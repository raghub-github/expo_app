import { Redirect, useLocalSearchParams } from "expo-router";

/** Legacy route — same raise-ticket hub as Profile → Raise Ticket. */
export default function HelpScreen() {
  const params = useLocalSearchParams<{ prelogin?: string }>();
  return (
    <Redirect
      href={{
        pathname: "/raise-ticket",
        params: params.prelogin ? { prelogin: String(params.prelogin) } : { prelogin: "1" },
      }}
    />
  );
}
