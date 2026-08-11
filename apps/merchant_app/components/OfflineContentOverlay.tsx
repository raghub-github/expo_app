/**
 * Offline empty state confined to the main content area (between header and bottom tab bar).
 * Header, sub-navigation pills, and bottom nav remain visible underneath.
 */
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HEADER_HEIGHT, TAB_BAR_FLOATING_GAP, TAB_BAR_HEIGHT } from "@/constants/theme";
import { useNetworkStatus } from "@/context/NetworkStatusContext";
import { OfflineContentEmptyState } from "@/components/OfflineContentEmptyState";

const OFFLINE_CONTENT_DELAY_MS = 800;

export function OfflineContentOverlay() {
  const insets = useSafeAreaInsets();
  const { isOnline, ready, refresh } = useNetworkStatus();
  const [retrying, setRetrying] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const offlineSinceRef = useRef<number | null>(null);

  const tabBarTotalHeight = TAB_BAR_HEIGHT + insets.bottom + TAB_BAR_FLOATING_GAP;
  const contentTop = insets.top + HEADER_HEIGHT;

  useEffect(() => {
    if (!ready) return;
    if (isOnline) {
      offlineSinceRef.current = null;
      setShowContent(false);
      return;
    }
    offlineSinceRef.current = Date.now();
    const t = setTimeout(() => {
      if (offlineSinceRef.current != null) setShowContent(true);
    }, OFFLINE_CONTENT_DELAY_MS);
    return () => clearTimeout(t);
  }, [isOnline, ready]);

  const onRetry = async () => {
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  if (!ready || isOnline || !showContent) {
    return null;
  }

  return (
    <View
      style={[
        styles.overlay,
        {
          top: contentTop,
          bottom: tabBarTotalHeight,
        },
      ]}
      pointerEvents="auto"
    >
      <OfflineContentEmptyState onRetry={onRetry} retrying={retrying} variant="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 50,
    elevation: 50,
  },
});
