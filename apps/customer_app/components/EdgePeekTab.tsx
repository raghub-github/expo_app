/**
 * Dining-style edge peek — hangs half off the screen edge beside cart/nav.
 * Distinct navy fill so it never blends with white nav or mint cart.
 */

import { Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { FLOATING_CART_BAR_HEIGHT } from "@/constants/layout";

export type EdgePeekSide = "left" | "right";
export type EdgePeekLabel = "HOME" | "CART" | "TRACK" | "FILTERS";

type Props = {
  side: EdgePeekSide;
  label: EdgePeekLabel;
  onPress: () => void;
  /** Match sibling footing height (cart bar / nav capsule). */
  height?: number;
};

/** How much of the peek hangs past the screen edge (Dining cut-off). */
const PEEK_OVERHANG = 12;
/** Visible width on-screen (plus overhang = total pill width). */
const PEEK_VISIBLE = 40;
const PEEK_TOTAL_W = PEEK_VISIBLE + PEEK_OVERHANG;
/** Gap between floating pill and this edge tab. */
export const EDGE_PEEK_GAP = 6;
export const EDGE_PEEK_ROW_GAP = PEEK_VISIBLE + EDGE_PEEK_GAP;

/** Navy — clearly not white nav / mint cart. */
const EDGE_BG = "#1E3A5F";
const EDGE_FG = "#FFFFFF";

const ICON: Record<EdgePeekLabel, ComponentProps<typeof Ionicons>["name"]> = {
  HOME: "home",
  CART: "cart",
  TRACK: "navigate",
  FILTERS: "options",
};

function edgeLabelText(label: EdgePeekLabel): string {
  if (label === "HOME") return "Home";
  if (label === "CART") return "Cart";
  if (label === "TRACK") return "Track";
  return "Filters";
}

export function EdgePeekTab({
  side,
  label,
  onPress,
  height = FLOATING_CART_BAR_HEIGHT,
}: Props) {
  const isLeft = side === "left";
  const pillH = Math.max(48, height);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      unstable_pressDelay={0}
      hitSlop={6}
      collapsable={false}
      style={({ pressed }) => [
        styles.hit,
        isLeft ? styles.hitLeft : styles.hitRight,
        { height: pillH },
        pressed && styles.pressed,
      ]}
    >
      <View
        collapsable={false}
        style={[
          styles.pill,
          isLeft ? styles.pillLeft : styles.pillRight,
          { height: pillH, backgroundColor: EDGE_BG },
        ]}
      >
        <Ionicons name={ICON[label]} size={15} color={EDGE_FG} />
        <Text style={styles.label} allowFontScaling={false} numberOfLines={1}>
          {edgeLabelText(label)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: PEEK_TOTAL_W,
    zIndex: 2,
    justifyContent: "center",
  },
  hitLeft: {
    marginLeft: -PEEK_OVERHANG,
  },
  hitRight: {
    marginRight: -PEEK_OVERHANG,
  },
  pressed: {
    opacity: 0.9,
  },
  pill: {
    width: PEEK_TOTAL_W,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  pillLeft: {
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    paddingLeft: PEEK_OVERHANG + 4,
  },
  pillRight: {
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    paddingRight: PEEK_OVERHANG + 4,
  },
  label: {
    color: EDGE_FG,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.15,
    textAlign: "center",
  },
});
