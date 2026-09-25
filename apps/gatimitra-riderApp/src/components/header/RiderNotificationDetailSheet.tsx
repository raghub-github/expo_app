import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import type { InboxItem } from "@gatimitra/expo-push-kit";
import { formatInboxTime } from "@gatimitra/expo-push-kit";
import { PermissionBottomSheetShell } from "@/src/components/permissions/PermissionBottomSheetShell";
import { colors } from "@/src/theme";

type Props = {
  visible: boolean;
  item: InboxItem | null;
  onClose: () => void;
  onOpenLink?: () => void;
  hasLink?: boolean;
};

export function RiderNotificationDetailSheet({
  visible,
  item,
  onClose,
  onOpenLink,
  hasLink = false,
}: Props) {
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
        <Text style={styles.kicker}>Notification</Text>
        <Text style={styles.title}>{item?.title?.trim() || "GatiMitra"}</Text>
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.body}>
            {item?.body?.trim() || "No additional details."}
          </Text>
        </ScrollView>
        <View style={styles.actions}>
          {hasLink && onOpenLink ? (
            <Pressable style={styles.primaryBtn} onPress={onOpenLink}>
              <Text style={styles.primaryBtnText}>Open</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.secondaryBtn, !hasLink && styles.primaryBtn]}
            onPress={onClose}
          >
            <Text
              style={[styles.secondaryBtnText, !hasLink && styles.primaryBtnText]}
            >
              Close
            </Text>
          </Pressable>
        </View>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary[700],
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  time: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 220,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: "#334155",
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: colors.primary[600],
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  secondaryBtnText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 15,
  },
});
