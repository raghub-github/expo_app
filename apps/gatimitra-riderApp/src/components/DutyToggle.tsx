import React, { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { useDutyToggle } from "@/src/hooks/useDutyToggle";
import { useRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";
import { OffDutyConfirmModal } from "@/src/components/home/OffDutyConfirmModal";
import { SubscriptionDutyBlockedSheet } from "@/src/components/subscription/SubscriptionDutyBlockedSheet";
import { LORA_BOLD } from "@/src/theme/headerFonts";

interface DutyToggleProps {
  compact?: boolean;
  variant?: "default" | "pill" | "compact" | "status";
}

export function DutyToggle({ compact = false, variant = "default" }: DutyToggleProps) {
  const { t } = useTranslation();
  const { isOnDuty, setDuty, isPending, dutyGoOnBlocked } = useDutyToggle();
  const { refetch: refetchSubscription } = useRiderSubscriptionStatus();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [blockedSheetVisible, setBlockedSheetVisible] = useState(false);

  const requestToggle = useCallback(() => {
    if (isPending) return;
    if (isOnDuty) {
      setConfirmVisible(true);
      return;
    }
    if (dutyGoOnBlocked) {
      void refetchSubscription();
      setBlockedSheetVisible(true);
      return;
    }
    void setDuty(true).then((result) => {
      if (result?.blockedFromGoingOn) {
        setBlockedSheetVisible(true);
      }
    });
  }, [dutyGoOnBlocked, isOnDuty, isPending, refetchSubscription, setDuty]);

  const handleConfirmOffDuty = useCallback(() => {
    void setDuty(false).finally(() => setConfirmVisible(false));
  }, [setDuty]);

  const modal = (
    <>
      <OffDutyConfirmModal
        visible={confirmVisible}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={handleConfirmOffDuty}
        loading={isPending}
      />
      <SubscriptionDutyBlockedSheet
        visible={blockedSheetVisible}
        onClose={() => setBlockedSheetVisible(false)}
      />
    </>
  );

  if (variant === "status") {
    return (
      <View style={styles.host} collapsable={false}>
        <Pressable
          onPress={requestToggle}
          disabled={isPending}
          style={[styles.statusPill, isPending && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: isOnDuty, disabled: dutyGoOnBlocked }}
        >
          <View style={[styles.statusDot, { backgroundColor: isOnDuty ? "#22C55E" : "#9CA3AF" }]} />
          <Text style={[styles.statusText, { color: isOnDuty ? "#16A34A" : "#6B7280" }]}>
            {isOnDuty ? t("topbar.online", "ONLINE") : t("topbar.offline", "OFFLINE")}
          </Text>
        </Pressable>
        {modal}
      </View>
    );
  }

  if (variant === "pill") {
    const dutyLabel = isOnDuty
      ? t("topbar.dutyOn", "ON-DUTY")
      : t("topbar.dutyOff", "OFF-DUTY");

    return (
      <View style={styles.pillHost} collapsable={false}>
        <Pressable
          onPress={requestToggle}
          disabled={isPending}
          style={({ pressed }) => [
            isPending && { opacity: 0.75 },
            dutyGoOnBlocked && !isOnDuty && { opacity: 0.72 },
            pressed && styles.pillPressed,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: isOnDuty, disabled: dutyGoOnBlocked }}
          accessibilityLabel={dutyLabel}
        >
          <View
            style={[
              styles.pill,
              isOnDuty ? styles.pillOn : styles.pillOff,
              dutyGoOnBlocked && !isOnDuty && styles.pillLocked,
              styles.pillShadow,
            ]}
          >
            <View style={styles.pillStatusIcon} />
            <Text style={styles.pillText} numberOfLines={1}>
              {dutyLabel}
            </Text>
          </View>
        </Pressable>
        {modal}
      </View>
    );
  }

  if (variant === "compact" || compact) {
    return (
      <View style={styles.host} collapsable={false}>
        <Pressable
          onPress={requestToggle}
          disabled={isPending}
          style={{
            width: 48,
            height: 28,
            borderRadius: 14,
            backgroundColor: isOnDuty ? "#16A34A" : "#D1D5DB",
            justifyContent: "center",
            paddingHorizontal: 3,
            opacity: isPending ? 0.55 : 1,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#FFFFFF",
              transform: [{ translateX: isOnDuty ? 20 : 0 }],
            }}
          />
        </Pressable>
        {modal}
      </View>
    );
  }

  return (
    <View style={styles.host} collapsable={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: "#374151" }}>
          {isOnDuty ? t("topbar.dutyOn") : t("topbar.dutyOff")}
        </Text>
        <Pressable
          onPress={requestToggle}
          disabled={isPending}
          style={{
            width: 56,
            height: 28,
            borderRadius: 14,
            backgroundColor: isOnDuty ? "#16A34A" : "#D1D5DB",
            justifyContent: "center",
            paddingHorizontal: 3,
            opacity: isPending ? 0.55 : 1,
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#FFFFFF",
              transform: [{ translateX: isOnDuty ? 28 : 0 }],
            }}
          />
        </Pressable>
      </View>
      {modal}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  pillHost: {
    flexShrink: 0,
    alignSelf: "flex-start",
    justifyContent: "center",
    overflow: "visible",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: LORA_BOLD,
    fontSize: 12,
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    height: 40,
    minWidth: 108,
    borderRadius: 12,
  },
  pillOn: {
    backgroundColor: "#15803D",
  },
  pillOff: {
    backgroundColor: "#334155",
  },
  pillLocked: {
    backgroundColor: "#7F1D1D",
  },
  pillShadow: Platform.select({
    ios: {
      shadowColor: "#052E16",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 6,
    },
    android: { elevation: 4 },
    default: {},
  }),
  pillPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.94,
  },
  pillStatusIcon: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  pillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
});
