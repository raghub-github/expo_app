/**
 * Classic food home — pins the category rail under the status bar after scroll
 * past the in-flow rail (hero / search header scrolls away with the list).
 *
 * Sticky chrome must be fully opaque so the still-scrolling in-flow rail
 * underneath never reads as a white blank band while flinging past.
 */

import { StyleSheet, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  scrollY: SharedValue<number>;
  stickAt: SharedValue<number>;
  topInset: number;
  children: React.ReactNode;
  onStickyChange?: (sticky: boolean) => void;
};

function isSticky(y: number, stickAt: number): boolean {
  "worklet";
  if (stickAt <= 1) return false;
  // Match chrome snap threshold (stickAt - 8).
  return y >= Math.max(8, stickAt - 8);
}

export function ClassicStickyCategoryChrome({
  scrollY,
  stickAt,
  topInset,
  children,
  onStickyChange,
}: Props) {
  useAnimatedReaction(
    () => isSticky(scrollY.value, stickAt.value),
    (sticky, prev) => {
      if (sticky === prev) return;
      if (onStickyChange) runOnJS(onStickyChange)(sticky);
    },
    [onStickyChange]
  );

  const chromeStyle = useAnimatedStyle(() => {
    const at = stickAt.value;
    const y = scrollY.value;
    // Rest / unmeasured: never paint a second rail over the header.
    if (!Number.isFinite(at) || at <= 1 || y < 4) {
      return { opacity: 0, pointerEvents: "none" as const };
    }
    const snapY = Math.max(8, at - 8);
    const sticky = y >= snapY;
    return {
      opacity: sticky ? 1 : 0,
      pointerEvents: sticky ? ("auto" as const) : ("none" as const),
    };
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.host, { paddingTop: topInset }, chromeStyle]}
      collapsable={false}
    >
      {/* Opaque fill — covers the faded in-flow rail under the pin (no white hole). */}
      <View style={styles.opaqueFill} pointerEvents="none" collapsable={false} />
      <View style={styles.inner} collapsable={false}>
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    // No elevation/shadow — flat with content so the rail doesn't look overlapped.
    elevation: 0,
    backgroundColor: GatiMitraColors.softBackground,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  opaqueFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GatiMitraColors.softBackground,
  },
  inner: {
    paddingBottom: 2,
    backgroundColor: GatiMitraColors.softBackground,
  },
});
