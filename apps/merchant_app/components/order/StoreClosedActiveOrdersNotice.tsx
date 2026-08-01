import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";

export const STORE_CLOSED_ACTIVE_TITLE = "Store is closed for new orders";
export const STORE_CLOSED_ACTIVE_BODY =
  "You still have active orders to complete. Finish preparing and dispatching them below.";
export const STORE_CLOSED_ACTIVE_MARQUEE = `${STORE_CLOSED_ACTIVE_TITLE} · ${STORE_CLOSED_ACTIVE_BODY}`;

/**
 * Shared across Home + Orders (both tabs stay mounted with lazy:false).
 * Without a single session flag + bus, Okay on one Modal leaves the other open.
 */
let dismissedForSession = false;
const dismissListeners = new Set<() => void>();

function getDismissedSnapshot(): boolean {
  return dismissedForSession;
}

function subscribeDismissed(onStoreChange: () => void): () => void {
  dismissListeners.add(onStoreChange);
  return () => {
    dismissListeners.delete(onStoreChange);
  };
}

function dismissStoreClosedActiveModalForSession(): void {
  if (dismissedForSession) return;
  dismissedForSession = true;
  for (const listener of [...dismissListeners]) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

/** Only one RN Modal host may paint — avoids stacked invisible blockers. */
let modalHostClaim: string | null = null;

function StoreClosedActiveOrdersModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />
        <View style={styles.modalCard}>
          <View style={styles.modalIconWrap}>
            <Ionicons name="storefront-outline" size={26} color="#B45309" />
          </View>
          <Text style={styles.modalTitle}>{STORE_CLOSED_ACTIVE_TITLE}</Text>
          <Text style={styles.modalBody}>{STORE_CLOSED_ACTIVE_BODY}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Okay"
            style={({ pressed }) => [styles.modalBtn, pressed && styles.pressed]}
          >
            <Text style={styles.modalBtnText}>Okay</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function StoreClosedActiveOrdersMarquee() {
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

  const onSegmentLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setSegmentWidth(w);
  };

  return (
    <View style={styles.marqueeWrap} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Animated.View style={[styles.marqueeRow, { transform: [{ translateX }] }]}>
        {[0, 1].map((copy) => (
          <Text
            key={copy}
            onLayout={copy === 0 ? onSegmentLayout : undefined}
            style={styles.marqueeText}
            numberOfLines={1}
          >
            {STORE_CLOSED_ACTIVE_MARQUEE}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * Popup when store is closed but active orders exist.
 * Okay dismisses for the whole JS session (until force-stop / cold start).
 * Marquee stays on screens that still have active closed-store work.
 */
export function StoreClosedActiveOrdersNotice({ visible }: { visible: boolean }) {
  const hostId = useId();
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
    getDismissedSnapshot
  );
  const [ownsModal, setOwnsModal] = useState(false);

  useEffect(() => {
    if (!visible || dismissed) {
      if (modalHostClaim === hostId) modalHostClaim = null;
      setOwnsModal(false);
      return;
    }
    if (modalHostClaim == null) {
      modalHostClaim = hostId;
      setOwnsModal(true);
      return;
    }
    setOwnsModal(modalHostClaim === hostId);
    return () => {
      if (modalHostClaim === hostId) modalHostClaim = null;
    };
  }, [visible, dismissed, hostId]);

  const showModal = visible && !dismissed && ownsModal;
  const showMarquee = visible && dismissed;

  return (
    <>
      <StoreClosedActiveOrdersModal
        open={showModal}
        onClose={dismissStoreClosedActiveModalForSession}
      />
      {showMarquee ? <StoreClosedActiveOrdersMarquee /> : null}
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
    zIndex: 1,
  },
  modalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  modalBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  modalBtn: {
    marginTop: 16,
    width: "100%",
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: { opacity: 0.9 },
  marqueeWrap: {
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
    paddingVertical: 10,
    marginBottom: 10,
  },
  marqueeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  marqueeText: {
    paddingHorizontal: 24,
    fontSize: 13,
    fontWeight: "600",
    color: "#92400E",
  },
});
