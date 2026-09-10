import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { type VegModeStoreScope } from "@/lib/vegMode";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";

export type VegPopoverAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  visible: boolean;
  anchor: VegPopoverAnchor | null;
  onClose: () => void;
  onApplied?: () => void;
  onMoreSettings: () => void;
};

const CARD_W = 220;
const VEG_GREEN = "#22C55E";
const ARROW = 8;
const GAP_BELOW_TOGGLE = 6;

export function VegModePopover({
  visible,
  anchor,
  onClose,
  onApplied,
  onMoreSettings,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const applyVegMode = useDietaryPreferenceStore((s) => s.applyVegMode);
  const weekdays = useDietaryPreferenceStore((s) => s.weekdays);
  const [draftScope, setDraftScope] = useState<VegModeStoreScope>("all_restaurants");
  const appear = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      appear.value = 0;
      return;
    }
    // Draft only — do not turn Veg Mode on until Apply.
    const prefs = useDietaryPreferenceStore.getState();
    setDraftScope(prefs.storeScope);
    appear.value = 0;
    appear.value = withTiming(1, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, appear]);

  const top = useMemo(() => {
    const a = anchor;
    if (a && a.height > 0) {
      return a.y + a.height + GAP_BELOW_TOGGLE;
    }
    return Math.max(insets.top + 96, 112);
  }, [anchor, insets.top]);

  const { right, arrowLeft } = useMemo(() => {
    const a = anchor ?? { x: winW - 52, y: 72, width: 36, height: 20 };
    let nextRight = Math.max(8, winW - (a.x + a.width) - 2);
    if (winW - nextRight - CARD_W < 8) nextRight = Math.max(8, winW - CARD_W - 8);
    const cardLeft = winW - nextRight - CARD_W;
    const toggleCenter = a.x + a.width / 2;
    const nextArrowLeft = Math.max(
      10,
      Math.min(CARD_W - 18, toggleCenter - cardLeft - ARROW / 2)
    );
    return { right: nextRight, arrowLeft: nextArrowLeft };
  }, [anchor, winW]);

  const cardAnim = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [
      { translateY: (1 - appear.value) * 4 },
      { scale: 0.97 + appear.value * 0.03 },
    ],
  }));

  /** Outside tap / back — discard draft; leave store + toggle unchanged. */
  const dismissWithoutApply = () => {
    onClose();
  };

  const apply = () => {
    applyVegMode({
      storeScope: draftScope,
      weekdays,
    });
    onClose();
    onApplied?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismissWithoutApply}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Backdrop only — must NOT sit above the card or it steals radio/Apply taps. */}
        <Pressable
          style={styles.dismissHit}
          onPress={dismissWithoutApply}
          accessibilityLabel="Dismiss"
        />

        <Animated.View
          style={[styles.cardWrap, { top, right, width: CARD_W }, cardAnim]}
          // Capture touches on the card layer so the backdrop never wins.
          pointerEvents="auto"
        >
          <View style={[styles.arrow, { left: arrowLeft }]} pointerEvents="none" />
          <View style={styles.card} collapsable={false}>
            <AppText style={styles.title} numberOfLines={1}>
              See veg dishes from
            </AppText>

            <RadioRow
              label="All restaurants"
              selected={draftScope === "all_restaurants"}
              onPress={() => setDraftScope("all_restaurants")}
            />
            <RadioRow
              label="Pure Veg restaurants only"
              selected={draftScope === "pure_veg_only"}
              onPress={() => setDraftScope("pure_veg_only")}
            />

            <TouchableOpacity
              style={styles.applyBtn}
              onPress={apply}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Apply"
            >
              <AppText style={styles.applyText}>Apply</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onMoreSettings}
              style={styles.moreBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="More settings"
            >
              <AppText style={styles.moreText}>More settings</AppText>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.radioRow}
      onPress={onPress}
      activeOpacity={0.7}
      delayPressIn={0}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.radioLabelWrap}>
        <AppText style={styles.radioLabel} numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dismissHit: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  cardWrap: {
    position: "absolute",
    zIndex: 50,
    elevation: 40,
    paddingTop: ARROW / 2 + 1,
  },
  arrow: {
    position: "absolute",
    top: 1,
    width: ARROW,
    height: ARROW,
    backgroundColor: "#FFFFFF",
    transform: [{ rotate: "45deg" }],
    zIndex: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    overflow: "visible",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.08)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 28,
  },
  title: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 5,
    minHeight: 30,
  },
  radioLabelWrap: {
    flex: 1,
    marginRight: 10,
    minWidth: 0,
  },
  radioLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#1F2937",
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterOn: {
    borderColor: VEG_GREEN,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: VEG_GREEN,
  },
  applyBtn: {
    backgroundColor: VEG_GREEN,
    borderRadius: 8,
    minHeight: 32,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  applyText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "800",
  },
  moreBtn: {
    alignItems: "center",
    paddingVertical: 5,
  },
  moreText: {
    color: VEG_GREEN,
    fontSize: 12,
    fontWeight: "700",
  },
});
