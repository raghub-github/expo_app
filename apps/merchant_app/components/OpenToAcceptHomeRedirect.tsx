/**
 * Backup for OPEN TO ACCEPT deep links when native setData reaches Expo Router
 * but the pending-action stash was already consumed (or missing on older builds).
 *
 * Primary path: IncomingOrderModal consumes native pending `open` → Home New.
 */
import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { useRouter } from "expo-router";
import { merchantHomeNewOrdersHref } from "@/lib/merchantNavigation";

export default function OpenToAcceptHomeRedirect() {
  const router = useRouter();
  const lastNavAtRef = useRef(0);

  useEffect(() => {
    const goHomeNew = () => {
      const now = Date.now();
      if (now - lastNavAtRef.current < 1200) return;
      lastNavAtRef.current = now;
      router.replace(merchantHomeNewOrdersHref() as never);
    };

    const fromUrl = (url: string | null | undefined) => {
      if (!url) return;
      if (/orderTab=New/i.test(url) || /gmOpenHomeNewOrders=1/i.test(url)) {
        goHomeNew();
      }
    };

    void Linking.getInitialURL()
      .then(fromUrl)
      .catch(() => undefined);

    const sub = Linking.addEventListener("url", (event) => fromUrl(event.url));
    return () => sub.remove();
  }, [router]);

  return null;
}
