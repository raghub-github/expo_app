import React, { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useDutyToggle } from "@/src/hooks/useDutyToggle";
import { OffDutyConfirmModal } from "@/src/components/home/OffDutyConfirmModal";
import { LORA_BOLD } from "@/src/theme/headerFonts";

interface DutyToggleProps {
  compact?: boolean;
  variant?: "default" | "pill" | "compact" | "status";
}

export function DutyToggle({ compact = false, variant = "default" }: DutyToggleProps) {
  const { t } = useTranslation();
  const { isOnDuty, setDuty, isPending } = useDutyToggle();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const requestToggle = useCallback(() => {
    if (isPending) return;
    if (isOnDuty) {
      setConfirmVisible(true);
      return;
    }
    void setDuty(true);
  }, [isOnDuty, isPending, setDuty]);

  const handleConfirmOffDuty = useCallback(() => {
    void setDuty(false).finally(() => setConfirmVisible(false));
  }, [setDuty]);

  const modal = (
    <OffDutyConfirmModal
      visible={confirmVisible}
      onCancel={() => setConfirmVisible(false)}
      onConfirm={handleConfirmOffDuty}
      loading={isPending}
    />
  );

  if (variant === "status") {
    return (
      <>
        <Pressable
          onPress={requestToggle}
          disabled={isPending}
          style={[styles.statusPill, isPending && { opacity: 0.75 }]}
          accessibilityRole="switch"
          accessibilityState={{ checked: isOnDuty }}
        >
          <View style={[styles.statusDot, { backgroundColor: isOnDuty ? "#22C55E" : "#9CA3AF" }]} />
          <Text style={[styles.statusText, { color: isOnDuty ? "#16A34A" : "#6B7280" }]}>
            {isOnDuty ? t("topbar.online", "ONLINE") : t("topbar.offline", "OFFLINE")}
          </Text>
        </Pressable>
        {modal}
      </>
    );
  }

  if (variant === "pill") {
    return (
      <>
        <Pressable
          onPress={requestToggle}
          disabled={isPending}
          style={[
            styles.pill,
            { backgroundColor: isOnDuty ? "#16A34A" : "#374151" },
            isPending && { opacity: 0.75 },
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: isOnDuty }}
        >
          <View style={styles.pillIcon} />
          <Text style={styles.pillText}>
            {isOnDuty ? t("topbar.dutyOn", "ON DUTY") : t("topbar.dutyOff", "OFF DUTY")}
          </Text>
        </Pressable>
        {modal}
      </>
    );
  }

  if (compact) {
    return (
      <>
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
      </>
    );
  }

  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
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
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  pillIcon: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: "#ffffff",
  },
  pillText: {
    fontFamily: LORA_BOLD,
    color: "#ffffff",
    fontSize: 12,
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
});
