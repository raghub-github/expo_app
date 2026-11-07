import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import type { InboxItem } from "@gatimitra/expo-push-kit";
import { formatInboxTime } from "@gatimitra/expo-push-kit";
import { PermissionBottomSheetShell } from "@/src/components/permissions/PermissionBottomSheetShell";
import { colors } from "@/src/theme";
import { RiderFonts } from "@/src/theme/fonts";

type Props = {
  visible: boolean;
  item: InboxItem | null;
  onClose: () => void;
};

export function RiderNotificationDetailSheet({ visible, item, onClose }: Props) {
  const timeLabel = item
    ? formatInboxTime(item.queued_at || item.delivered_at || item.clicked_at || "")
    : "";

  return (
    <PermissionBottomSheetShell
      visible={visible && !!item}
      dismissible
      onDismiss={onClose}
      maxHeightRatio={0.72}
    >
      <View style={styles.wrap}>
        <View style={styles.handleHint} />
        <Text style={styles.kicker}>Notification</Text>
        <Text style={styles.title}>{item?.title?.trim() || "GatiMitra"}</Text>
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
        <View style={styles.bodyCard}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.body}>
              {item?.body?.trim() || "No additional details."}
            </Text>
          </ScrollView>
        </View>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>Close</Text>
        </Pressable>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
  },
  handleHint: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E2E8F0",
    marginBottom: 14,
  },
  kicker: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary[700],
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  title: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
    lineHeight: 26,
  },
  time: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 14,
  },
  bodyCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scroll: {
    maxHeight: 220,
  },
  scrollContent: {
    paddingBottom: 2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#334155",
  },
  closeBtn: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: colors.primary[700],
  },
  closeBtnText: {
    fontFamily: RiderFonts.loraBold,
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 16,
  },
});
