import { useEffect } from "react";
import {
  BackHandler,
  Modal,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { MerchantMenuLoadingSkeleton } from "@/components/merchant/MerchantMenuLoadingSkeleton";
import { useMerchantNavTransitionStore } from "@/store/merchantNavTransitionStore";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { FOOD_HOME_FALLBACK, safeRouterBack } from "@/lib/safeRouterBack";

/** Min time shutter stays up after show (slide feel). */
export const MERCHANT_NAV_SHUTTER_SLIDE_MS = 280;

/** Absolute max — never trap the user. */
const SHUTTER_MAX_MS = 1600;

/**
 * System Modal (animation none) — sits above the native stack so the skeleton
 * covers home the same frame as tap. Absolute Views were painted under the
 * navigator on Android, so the shutter never appeared until too late.
 */
export function MerchantNavTransitionShutter() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const active = useMerchantNavTransitionStore((s) => s.active);
  const merchantId = useMerchantNavTransitionStore((s) => s.merchantId);
  const loadingMessageIndex = useMerchantNavTransitionStore((s) => s.loadingMessageIndex);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => {
      useMerchantNavTransitionStore.getState().hide();
    }, SHUTTER_MAX_MS);
    return () => clearTimeout(t);
  }, [active, merchantId]);

  useEffect(() => {
    if (!active || Platform.OS !== "android") return;
    const onHardwareBack = () => {
      useMerchantNavTransitionStore.getState().hide();
      useScreenChromeStore.getState().resetStatusBarBackground();
      safeRouterBack(router, FOOD_HOME_FALLBACK);
      return true;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [active, router]);

  return (
    <Modal
      visible={active}
      animationType="none"
      transparent={false}
      statusBarTranslucent
      presentationStyle="fullScreen"
      onRequestClose={() => {
        useMerchantNavTransitionStore.getState().hide();
        useScreenChromeStore.getState().resetStatusBarBackground();
        safeRouterBack(router, FOOD_HOME_FALLBACK);
      }}
    >
      <View style={[styles.host, { minHeight: height }]} collapsable={false}>
        <MerchantMenuLoadingSkeleton
          key={`nav-load-${loadingMessageIndex}-${merchantId ?? ""}`}
          merchantId={merchantId ?? undefined}
          startMessageIndex={loadingMessageIndex}
          edgeToEdge
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
