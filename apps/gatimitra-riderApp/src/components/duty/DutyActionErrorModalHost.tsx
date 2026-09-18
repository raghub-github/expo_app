import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";
import {
  closeDutyActionError,
  useDutyActionErrorStore,
} from "@/src/stores/dutyActionErrorStore";
import { isRiderNetworkOnline } from "@/src/stores/riderNetworkStore";

/**
 * Reusable GatiMitra duty connectivity / location modal (replaces native Alert).
 */
export function DutyActionErrorModalHost() {
  const visible = useDutyActionErrorStore((s) => s.visible);
  const kind = useDutyActionErrorStore((s) => s.kind);
  const title = useDutyActionErrorStore((s) => s.title);
  const message = useDutyActionErrorStore((s) => s.message);
  const requestRetry = useDutyActionErrorStore((s) => s.requestRetry);
  const { height, isShortHeight } = useResponsiveLayout();
  const cardMaxH = Math.round(height * (isShortHeight ? 0.72 : 0.8));

  const isLocation = kind === "location";
  const iconName = isLocation ? "locate-outline" : "cloud-offline-outline";
  const iconColor = isLocation ? colors.primary[600] : "#B91C1C";

  const onClose = () => closeDutyActionError();

  const onTryAgain = () => {
    // Stay open while still offline — do not clear pending retry or stack modals.
    if ((kind === "network" || kind === "server") && !isRiderNetworkOnline()) {
      return;
    }
    requestRetry();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { maxHeight: cardMaxH }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ResponsiveSheetBody
            maxHeight={cardMaxH - 16}
            contentContainerStyle={styles.bodyContent}
            footerStyle={styles.footerSlot}
            footer={
              <View style={[rowLayout.row, styles.actions]}>
                <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
                  <Text style={styles.closeText} numberOfLines={1}>
                    Close
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onTryAgain}
                  style={styles.retryBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryText} numberOfLines={1}>
                    Try Again
                  </Text>
                </Pressable>
              </View>
            }
          >
            <View style={[styles.iconWrap, isLocation ? styles.iconWrapGps : styles.iconWrapNet]}>
              <Ionicons name={iconName} size={28} color={iconColor} />
            </View>
            <Text style={[styles.title, flexShrinkText]} numberOfLines={isShortHeight ? 3 : 4}>
              {title}
            </Text>
            <Text
              style={[styles.subtitle, flexShrinkText]}
              numberOfLines={isShortHeight ? 4 : 6}
            >
              {message}
            </Text>
          </ResponsiveSheetBody>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingTop: 8,
    paddingBottom: 10,
    alignItems: "stretch",
    overflow: "hidden",
    flexShrink: 1,
    minHeight: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  bodyContent: {
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  footerSlot: {
    borderTopWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 22,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  iconWrapNet: {
    backgroundColor: "#FEE2E2",
  },
  iconWrapGps: {
    backgroundColor: "#DCFCE7",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 10,
    alignSelf: "stretch",
  },
  subtitle: {
    fontSize: 13,
    color: colors.gray[500],
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 8,
    paddingHorizontal: 4,
    alignSelf: "stretch",
  },
  actions: {
    justifyContent: "flex-end",
    alignSelf: "stretch",
    gap: 20,
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  closeText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[500],
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 72,
    alignItems: "center",
    flexShrink: 0,
  },
  retryText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.primary[600],
  },
});
