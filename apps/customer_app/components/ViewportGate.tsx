/**
 * React Native stand-in for Intersection Observer.
 * Mounts children only once the host enters (or nears) the viewport.
 * Above-the-fold callers should pass `eager` so content paints immediately.
 *
 * IMPORTANT: Do not use onLayout.y − scrollY as a viewport test inside FlashList /
 * virtualized rows. layout.y is relative to the cell (often ~0), which falsely
 * marks every off-screen row as visible and loads all images at once.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Dimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  children: ReactNode;
  /** Reserve space before mount to avoid scroll jump. */
  placeholderHeight?: number;
  /** Extra px below the fold to start mounting early. */
  rootMargin?: number;
  /** Skip gating — mount immediately (hero / above-the-fold). */
  eager?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * Optional document scroll offset. Only used with `layoutAbsoluteY` when the
   * parent can provide a window-relative Y; ignored for FlashList cell children.
   */
  scrollY?: number;
  /** Window/content absolute Y when known (rare). Prefer measureInWindow. */
  layoutAbsoluteY?: number;
  /** Lightweight placeholder (skeleton) while off-screen. */
  placeholder?: ReactNode;
  onVisible?: () => void;
};

function isNearViewport(top: number, height: number, rootMargin: number): boolean {
  const screenH = Dimensions.get("window").height;
  const bottom = top + Math.max(height, 1);
  return top < screenH + rootMargin && bottom > -rootMargin;
}

export function ViewportGate({
  children,
  placeholderHeight = 1,
  rootMargin = 160,
  eager = false,
  style,
  scrollY = 0,
  layoutAbsoluteY,
  placeholder = null,
  onVisible,
}: Props) {
  const hostRef = useRef<View>(null);
  const [mounted, setMounted] = useState(eager);
  const layoutHRef = useRef(placeholderHeight);
  const notifiedRef = useRef(eager);
  const mountedRef = useRef(eager);

  const markMounted = useCallback(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    setMounted(true);
    if (!notifiedRef.current) {
      notifiedRef.current = true;
      onVisible?.();
    }
  }, [onVisible]);

  const check = useCallback(() => {
    if (mountedRef.current || eager) return;

    // Trusted path when parent supplies absolute Y (non-virtualized scroll).
    if (typeof layoutAbsoluteY === "number" && Number.isFinite(layoutAbsoluteY)) {
      if (isNearViewport(layoutAbsoluteY - scrollY, layoutHRef.current, rootMargin)) {
        markMounted();
        return;
      }
    }

    // FlashList / nested cells: only measureInWindow is trustworthy.
    hostRef.current?.measureInWindow((_x, y, w, h) => {
      if (mountedRef.current) return;
      // Not laid out yet — do not treat (0,0,0,0) as "on screen".
      if (!(h > 0 || w > 0 || layoutHRef.current > 1)) return;
      const height = h > 0 ? h : layoutHRef.current;
      if (isNearViewport(y, height, rootMargin)) {
        markMounted();
      }
    });
  }, [eager, layoutAbsoluteY, markMounted, rootMargin, scrollY]);

  useEffect(() => {
    if (eager) {
      markMounted();
      return;
    }
    if (mounted) return;
    check();
    const id = setInterval(check, 180);
    return () => clearInterval(id);
  }, [check, eager, markMounted, mounted]);

  useEffect(() => {
    if (eager || mounted) return;
    check();
  }, [scrollY, layoutAbsoluteY, check, eager, mounted]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      layoutHRef.current = e.nativeEvent.layout.height || placeholderHeight;
      check();
    },
    [check, placeholderHeight]
  );

  if (eager) {
    return <View style={style}>{children}</View>;
  }

  return (
    <View
      ref={hostRef}
      style={[{ minHeight: mounted ? undefined : placeholderHeight }, style]}
      onLayout={onLayout}
      collapsable={false}
    >
      {mounted ? children : placeholder}
    </View>
  );
}
