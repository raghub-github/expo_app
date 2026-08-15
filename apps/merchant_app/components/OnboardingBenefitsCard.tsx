/**
 * Home card — Onboarding benefits (light theme, compact like reference).
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import {
  GatiMitraMerchant,
  CARD_RADIUS,
  FONT_LORA_BOLD,
  FONT_LORA,
} from "@/constants/theme";
import {
  fetchOnboardingTask,
  formatOnboardingDeadline,
  isOnboardingExpired,
  peekCompletedOnboardingTask,
  shouldShowOnboardingBenefitsCard,
  startOnboardingTask,
} from "@/lib/onboardingBenefitsStorage";

type Props = {
  storeName?: string | null;
  onView: () => void;
};

export function OnboardingBenefitsCard({ storeName, onView }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={styles.title}>Onboarding benefits</Text>
          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={12} color={GatiMitraMerchant.success} />
            <Text style={styles.badgeText}>ACTIVATED</Text>
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {storeName?.trim() || "1 Outlet"}
          </Text>
        </View>
        <View style={styles.right}>
          <View style={styles.rocketWrap}>
            <Ionicons name="rocket-outline" size={26} color="#7DD3FC" />
          </View>
          <Pressable
            onPress={onView}
            style={({ pressed }) => [styles.viewBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="View onboarding benefits"
          >
            <Text style={styles.viewBtnText}>View</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Hook: window + visibility for home card. Card stays hidden until DB state is known. */
export function useOnboardingBenefitsWindow(
  storeId: string | null,
  eligible: boolean,
  itemsWithImages: number,
  itemCount: number,
  opts?: {
    storeDbId?: number | null;
    token?: string | null;
    catalogReady?: boolean;
  }
) {
  const storeDbId = opts?.storeDbId ?? null;
  const token = opts?.token ?? null;
  const catalogReady = opts?.catalogReady ?? (itemCount > 0 || !eligible);

  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [packagingTipsDone, setPackagingTipsDone] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [ready, setReady] = useState(false);
  const [visibleFromServer, setVisibleFromServer] = useState(false);

  const refresh = useCallback(async () => {
    if (!storeId || !storeDbId || !token) {
      setStartedAt(null);
      setPackagingTipsDone(false);
      setCompleted(false);
      setVisibleFromServer(false);
      setReady(false);
      return;
    }

    // Keep the card hidden until this fetch resolves. Do not assume incomplete.
    if (peekCompletedOnboardingTask(storeDbId)) {
      setCompleted(true);
    }

    const dto = await fetchOnboardingTask(storeDbId, token);
    if (!dto) {
      setVisibleFromServer(false);
      setReady(true);
      return;
    }

    if (dto.status === "COMPLETED") {
      setStartedAt(dto.startedAt);
      setPackagingTipsDone(Boolean(dto.packagingTipsCompletedAt));
      setCompleted(true);
      setVisibleFromServer(false);
      setReady(true);
      return;
    }

    if (dto.status === "INCOMPLETE") {
      setStartedAt(dto.startedAt);
      setPackagingTipsDone(Boolean(dto.packagingTipsCompletedAt));
      setCompleted(false);
      setVisibleFromServer(dto.visible === true);
      setReady(true);
      return;
    }

    // NOT_FOUND: start only when catalog proves the store is eligible.
    if (eligible && catalogReady) {
      const started = await startOnboardingTask(storeDbId, token);
      if (started?.status === "COMPLETED") {
        setStartedAt(started.startedAt);
        setPackagingTipsDone(Boolean(started.packagingTipsCompletedAt));
        setCompleted(true);
        setVisibleFromServer(false);
        setReady(true);
        return;
      }
      setStartedAt(started?.startedAt ?? null);
      setPackagingTipsDone(Boolean(started?.packagingTipsCompletedAt));
      setCompleted(false);
      setVisibleFromServer(started?.visible === true);
      setReady(true);
      return;
    }

    setStartedAt(null);
    setPackagingTipsDone(false);
    setCompleted(false);
    setVisibleFromServer(false);
    setReady(true);
  }, [storeId, storeDbId, token, eligible, catalogReady]);

  useEffect(() => {
    setReady(false);
    setVisibleFromServer(false);
    setCompleted(false);
  }, [storeDbId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const expired = useMemo(
    () => (startedAt ? isOnboardingExpired(startedAt) : false),
    [startedAt]
  );

  const visible = shouldShowOnboardingBenefitsCard({
    ready,
    visibleFromServer,
  });

  return {
    startedAt,
    packagingTipsDone,
    setPackagingTipsDone,
    expired,
    visible,
    deadlineLabel: startedAt ? formatOnboardingDeadline(startedAt) : null,
    completed,
  };
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  left: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 16,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  badge: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
  badgeText: {
    fontSize: 11,
    fontFamily: FONT_LORA_BOLD,
    letterSpacing: 0.4,
    color: GatiMitraMerchant.success,
  },
  meta: {
    marginTop: 8,
    fontSize: 13,
    fontFamily: FONT_LORA,
    color: GatiMitraMerchant.textSecondary,
  },
  right: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 72,
  },
  rocketWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  viewBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: "#fff",
  },
  viewBtnText: {
    fontSize: 13,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
});
