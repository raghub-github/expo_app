import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  Vibration,
  ActivityIndicator,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useDutyToggle } from "@/src/hooks/useDutyToggle";
import { useRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";
import { OffDutyConfirmModal } from "@/src/components/home/OffDutyConfirmModal";
import { openSubscriptionDutyBlockedSheet } from "@/src/stores/subscriptionDutyBlockedSheetStore";
import { headerControlText, HEADER_DUTY_PILL_WIDTH } from "@/src/theme/headerFonts";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

interface DutyToggleProps {
  compact?: boolean;
  variant?: "default" | "pill" | "compact" | "status";
  /** Short ON/OFF labels so the pill fits on zoomed / narrow headers. */
  compactLabels?: boolean;
}

/** Merchant-style sliding duty switch — width scales mildly with screen, never below touch target. */
const PILL_HEIGHT = 36;
const KNOB_SIZE = 24;
const KNOB_RADIUS = 7;
const PILL_PADDING = 4;
const LABEL_INSET = 6;

const ON_GREEN = "#16A34A";
const OFF_SLATE = "#334155";
const LOCKED_RED = "#7F1D1D";

function bumpTouchFeedback() {
  try {
    if (Platform.OS === "android") {
      Vibration.vibrate(18);
    } else if (Platform.OS === "ios") {
      Vibration.vibrate();
    }
  } catch {
    /* ignore */
  }
}

function springTo(anim: Animated.Value, toValue: number) {
  Animated.spring(anim, {
    toValue,
    useNativeDriver: false,
    speed: 22,
    bounciness: 4,
  }).start();
}

export function DutyToggle({
  compact = false,
  variant = "default",
  compactLabels = false,
}: DutyToggleProps) {
  const { t } = useTranslation();
  const { isOnDuty, setDuty, isPending, dutyGoOnBlocked } = useDutyToggle();
  const { refetch: refetchSubscription } = useRiderSubscriptionStatus();
  const [confirmVisible, setConfirmVisible] = useState(false);
  /** Instant UI while go-ON API runs — off-duty already feels instant via confirm sheet. */
  const [optimisticOn, setOptimisticOn] = useState<boolean | null>(null);
  const animValue = useRef(new Animated.Value(isOnDuty ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const { rw, isCompactWidth } = useResponsiveLayout();

  const useShortLabels = compactLabels || isCompactWidth;
  const pillWidth = useMemo(() => {
    if (useShortLabels) {
      return Math.round(rw(76, { min: 72, max: 88, factor: 0.4 }));
    }
    const base = HEADER_DUTY_PILL_WIDTH;
    return Math.round(rw(base, { min: 104, max: 120, factor: 0.35 }));
  }, [rw, useShortLabels]);
  const knobTravel = pillWidth - PILL_PADDING * 2 - KNOB_SIZE;
  const labelSlot = pillWidth - PILL_PADDING * 2 - KNOB_SIZE - 4;

  const displayOn = optimisticOn ?? isOnDuty;

  useEffect(() => {
    setOptimisticOn(null);
  }, [isOnDuty]);

  useEffect(() => {
    springTo(animValue, displayOn ? 1 : 0);
  }, [displayOn, animValue]);

  const requestToggle = useCallback(() => {
    if (isPending) return;
    bumpTouchFeedback();

    if (isOnDuty) {
      // Going OFF — confirm sheet gives immediate feedback.
      setConfirmVisible(true);
      return;
    }

    if (dutyGoOnBlocked) {
      void refetchSubscription();
      openSubscriptionDutyBlockedSheet();
      return;
    }

    // Going ON — spinner shows immediately via isPending; pill stays OFF until PUT succeeds.
    void setDuty(true).then((result) => {
      if (result?.ok) {
        setOptimisticOn(true);
        springTo(animValue, 1);
        return;
      }
      setOptimisticOn(false);
      springTo(animValue, 0);
      if (result?.blockedFromGoingOn) {
        openSubscriptionDutyBlockedSheet();
      }
      // location mismatch opens its own sheet via useDutyToggle
    });
  }, [animValue, dutyGoOnBlocked, isOnDuty, isPending, refetchSubscription, setDuty]);

  const handleConfirmOffDuty = useCallback(() => {
    bumpTouchFeedback();
    setOptimisticOn(false);
    springTo(animValue, 0);
    void setDuty(false)
      .then((result) => {
        if (!result?.ok) {
          setOptimisticOn(true);
          springTo(animValue, 1);
        }
      })
      .finally(() => setConfirmVisible(false));
  }, [animValue, setDuty]);

  const onPressIn = useCallback(() => {
    Animated.spring(pressScale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  }, [pressScale]);

  const onPressOut = useCallback(() => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
  }, [pressScale]);

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
    const onLabel = useShortLabels
      ? t("topbar.dutyOnShort", "ON")
      : t("topbar.dutyOn", "ON-DUTY");
    const offLabel = useShortLabels
      ? t("topbar.dutyOffShort", "OFF")
      : t("topbar.dutyOff", "OFF-DUTY");
    const turningOn = isPending && !displayOn;
    const dutyLabel = turningOn
      ? t("topbar.dutyTurningOn", "…")
      : displayOn
        ? onLabel
        : offLabel;

    const backgroundColor = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [
        dutyGoOnBlocked && !displayOn ? LOCKED_RED : OFF_SLATE,
        ON_GREEN,
      ],
    });
    const knobTranslateX = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0, knobTravel],
    });

    return (
      <View style={[styles.pillHost, { width: pillWidth }]} collapsable={false}>
        <Pressable
          onPress={requestToggle}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={isPending}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityRole="switch"
          accessibilityState={{
            checked: displayOn,
            disabled: dutyGoOnBlocked || isPending,
            busy: isPending,
          }}
          accessibilityLabel={
            turningOn ? t("topbar.dutyTurningOnA11y", "Turning on duty") : dutyLabel
          }
        >
          <Animated.View style={{ transform: [{ scale: pressScale }] }}>
            <Animated.View
              style={[
                styles.pill,
                { backgroundColor, width: pillWidth },
                isPending && styles.pillBusy,
              ]}
            >
              <View
                style={[styles.labelLeft, { width: labelSlot, paddingLeft: LABEL_INSET }]}
                pointerEvents="none"
              >
                <Text style={styles.pillText} numberOfLines={1} allowFontScaling={false}>
                  {displayOn ? onLabel : ""}
                </Text>
              </View>
              <View
                style={[styles.labelRight, { width: labelSlot, paddingRight: LABEL_INSET }]}
                pointerEvents="none"
              >
                <Text style={styles.pillText} numberOfLines={1} allowFontScaling={false}>
                  {!displayOn ? (turningOn ? t("topbar.dutyTurningOn", "…") : offLabel) : ""}
                </Text>
              </View>
              <Animated.View
                style={[styles.knob, { transform: [{ translateX: knobTranslateX }] }]}
                pointerEvents="none"
              >
                {turningOn ? (
                  <ActivityIndicator size="small" color={OFF_SLATE} />
                ) : (
                  <View
                    style={[
                      styles.knobDot,
                      { backgroundColor: displayOn ? ON_GREEN : OFF_SLATE },
                    ]}
                  />
                )}
              </Animated.View>
            </Animated.View>
          </Animated.View>
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
        <Text style={{ ...headerControlText, fontSize: 14, color: "#374151" }}>
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
    height: PILL_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
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
    ...headerControlText,
    fontSize: 12,
    letterSpacing: 0.2,
  },
  pill: {
    height: PILL_HEIGHT,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PILL_PADDING,
    position: "relative",
    overflow: "hidden",
  },
  pillBusy: {
    opacity: 0.96,
  },
  labelLeft: {
    position: "absolute",
    left: PILL_PADDING,
    justifyContent: "center",
    height: PILL_HEIGHT,
    zIndex: 1,
  },
  labelRight: {
    position: "absolute",
    right: PILL_PADDING,
    alignItems: "flex-end",
    justifyContent: "center",
    height: PILL_HEIGHT,
    zIndex: 1,
  },
  pillText: {
    ...headerControlText,
    color: "#FFFFFF",
    fontSize: 11,
    textAlignVertical: "center",
  },
  knob: {
    position: "absolute",
    left: PILL_PADDING,
    top: (PILL_HEIGHT - KNOB_SIZE) / 2,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_RADIUS,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  knobDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
});
