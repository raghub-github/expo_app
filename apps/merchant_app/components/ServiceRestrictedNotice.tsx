/**
 * Service Restricted notice for merchants.
 *
 * Shown when the store's delivery circle overlaps an active Prevent Services
 * block. The store stays online — only orders whose drop is inside a blocked
 * area are withheld. Modal once per signal version; banner dismissible for
 * the current app session and reappears after reload while the restriction
 * remains active.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  LayoutChangeEvent,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { GatiMitraMerchant } from "@/constants/theme";
import { getConfig } from "@/config/env";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { onPreventServicesSignal } from "@/lib/preventServicesSignalBus";

const MODAL_TITLE = "Service Restricted";
const MODAL_BODY =
  "Some delivery areas around your store have been temporarily disabled by GatiMitra Admin.\n\nOrders from those blocked areas will not be assigned to your store.\n\nOrders from all other active delivery areas will continue normally.";
const BANNER_TEXT =
  "⚠️ Some nearby delivery areas are currently restricted by GatiMitra Admin. Orders from unrestricted areas will continue as normal.";

const ACK_KEY_PREFIX = "prevent_services_merchant_ack_v:";

function ackKeyForStore(storeId: number | string): string {
  return `${ACK_KEY_PREFIX}${storeId}`;
}

type ImpactResponse = {
  ok?: boolean;
  affected?: boolean;
  signalVersion?: number;
};

async function fetchStoreImpact(storeId: number | string): Promise<ImpactResponse | null> {
  try {
    const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
    const res = await fetch(
      `${base}/v1/prevent-services/impact/store?storeId=${encodeURIComponent(String(storeId))}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return (await res.json()) as ImpactResponse;
  } catch {
    return null;
  }
}

function RestrictedModal({ open, onGotIt }: { open: boolean; onGotIt: () => void }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalIconWrap}>
            <Ionicons name="shield-outline" size={26} color="#B45309" />
          </View>
          <Text style={styles.modalTitle}>{MODAL_TITLE}</Text>
          <Text style={styles.modalBody}>{MODAL_BODY}</Text>
          <Pressable
            onPress={onGotIt}
            style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
          >
            <Text style={styles.modalBtnText}>Got It</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RestrictedBanner({ onClose }: { onClose: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [segmentWidth, setSegmentWidth] = useState(0);

  useEffect(() => {
    if (segmentWidth <= 0) return undefined;
    translateX.setValue(0);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: -segmentWidth,
        duration: 28_000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [segmentWidth, translateX]);

  return (
    <View style={styles.bannerWrap} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Animated.View style={[styles.bannerRow, { transform: [{ translateX }] }]}>
        {[0, 1].map((copy) => (
          <Text
            key={copy}
            onLayout={
              copy === 0
                ? (e: LayoutChangeEvent) => {
                    const w = e.nativeEvent.layout.width;
                    if (w > 0) setSegmentWidth(w);
                  }
                : undefined
            }
            style={styles.bannerText}
            numberOfLines={1}
          >
            {BANNER_TEXT}
          </Text>
        ))}
      </Animated.View>
      <Pressable onPress={onClose} hitSlop={10} style={styles.bannerClose} accessibilityLabel="Dismiss">
        <Ionicons name="close" size={16} color="#92400E" />
      </Pressable>
    </View>
  );
}

export default function ServiceRestrictedNotice() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const [affected, setAffected] = useState(false);
  const [signalVersion, setSignalVersion] = useState(0);
  const [ackedVersion, setAckedVersion] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (storeId == null) {
      setAffected(false);
      return;
    }
    const impact = await fetchStoreImpact(storeId);
    const nextAffected = impact?.affected === true;
    const version = Number(impact?.signalVersion ?? 0) || 0;
    setAffected(nextAffected);
    setSignalVersion(version);
    if (!nextAffected) {
      setBannerDismissed(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId == null) {
      setAckedVersion(null);
      return;
    }
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(ackKeyForStore(storeId));
        const n = raw != null ? Number(raw) : null;
        setAckedVersion(Number.isFinite(n as number) ? (n as number) : null);
      } catch {
        setAckedVersion(null);
      }
    })();
  }, [storeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Restriction cleared → hide modal/banner immediately; no leftover UI.
  useEffect(() => {
    if (!affected) {
      setBannerDismissed(false);
    }
  }, [affected]);
  useEffect(() => {
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refresh();
      }, 150);
    };
    // Share the single realtime channel from PreventServicesRealtime (no duplicate WS).
    const off = onPreventServicesSignal(schedule);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      off();
    };
  }, [refresh]);

  const needsModal =
    affected && signalVersion > 0 && (ackedVersion == null || ackedVersion < signalVersion);
  const showBanner = affected && !needsModal && !bannerDismissed;

  const onGotIt = useCallback(async () => {
    if (storeId == null) return;
    setAckedVersion(signalVersion);
    setBannerDismissed(false);
    try {
      await SecureStore.setItemAsync(ackKeyForStore(storeId), String(signalVersion));
    } catch {}
  }, [signalVersion, storeId]);

  if (!affected && !needsModal) return null;

  return (
    <>
      <RestrictedModal open={needsModal} onGotIt={onGotIt} />
      {showBanner ? <RestrictedBanner onClose={() => setBannerDismissed(true)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: "center",
  },
  modalIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 20,
  },
  modalBtn: {
    alignSelf: "stretch",
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.9 },
  bannerWrap: {
    overflow: "hidden",
    backgroundColor: "#FFFBEB",
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
    paddingVertical: 8,
    paddingRight: 28,
  },
  bannerRow: {
    flexDirection: "row",
  },
  bannerText: {
    paddingHorizontal: 16,
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
  },
  bannerClose: {
    position: "absolute",
    right: 8,
    top: 8,
  },
});
