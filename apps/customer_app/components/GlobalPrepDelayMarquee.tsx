/**
 * Global prep-delay marquee — auto-dismisses after expiry (20s default).
 */
import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrderStore } from "@/store/orderStore";
import { PrepDelayMarqueeBanner } from "@/components/orders/PrepDelayMarqueeBanner";

export function GlobalPrepDelayMarquee() {
  const insets = useSafeAreaInsets();
  const banner = useOrderStore((s) => s.prepDelayBanner);
  const clearPrepDelayBanner = useOrderStore((s) => s.clearPrepDelayBanner);

  useEffect(() => {
    if (!banner) return;
    const remaining = banner.expiresAt - Date.now();
    if (remaining <= 0) {
      clearPrepDelayBanner();
      return;
    }
    const t = setTimeout(clearPrepDelayBanner, remaining);
    return () => clearTimeout(t);
  }, [banner, clearPrepDelayBanner]);

  if (!banner || banner.expiresAt <= Date.now()) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + 4 }]} pointerEvents="none">
      <PrepDelayMarqueeBanner message={banner.message} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 9999,
    elevation: 20,
  },
});
