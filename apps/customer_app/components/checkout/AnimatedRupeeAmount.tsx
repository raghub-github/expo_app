/**
 * A rupee amount that counts up/down to its new value.
 *
 * The animation deliberately lives *inside* this leaf. `useAnimatedCount` drives
 * a `setState` per tick, so calling it at the top of `CheckoutScreen` — a single
 * 5,300-line component with 64 `useState`s — meant every bill recalculation
 * re-rendered the entire checkout tree repeatedly for the duration of the tween,
 * from two concurrent instances. Owning the hook here confines each tick's
 * re-render to this one `Text`.
 *
 * Memoised on props, so a checkout re-render triggered by anything else (a
 * coupon sheet opening, an address change) does not restart the tween.
 */

import { memo } from "react";
import type { StyleProp, TextStyle } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { useAnimatedCount } from "@/hooks/useAnimatedCount";

type Props = {
  /** `null` renders `fallback` and skips the animation entirely. */
  value: number | null | undefined;
  /**
   * False while billing is still resolving, so the first real total snaps in
   * rather than visibly counting up from a placeholder zero.
   */
  ready?: boolean;
  style?: StyleProp<TextStyle>;
  bold?: boolean;
  numberOfLines?: number;
  /** Shown when `value` is null — defaults to an em dash. */
  fallback?: string;
};

function AnimatedRupeeAmountInner({
  value,
  ready = true,
  style,
  bold,
  numberOfLines,
  fallback = "—",
}: Props) {
  const animated = useAnimatedCount(value ?? 0, 260, ready);
  return (
    <CheckoutText style={style} bold={bold} numberOfLines={numberOfLines}>
      {value != null ? `₹${animated.toFixed(2)}` : fallback}
    </CheckoutText>
  );
}

export const AnimatedRupeeAmount = memo(AnimatedRupeeAmountInner);
