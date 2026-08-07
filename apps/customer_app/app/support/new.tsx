/**
 * Deep link alias — opens raise-ticket modal on My Support (ticket home).
 */
import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function RaiseTicketScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace({ pathname: "/support", params: { newTicket: "1" } } as never);
  }, [router]);

  return null;
}
