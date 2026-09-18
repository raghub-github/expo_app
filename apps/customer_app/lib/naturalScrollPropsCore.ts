/**
 * Shared ScrollView / list props for native-feel free scrolling.
 * Core builders stay free of `react-native` so unit tests can run under node/tsx.
 */

/**
 * Android RN maps `normal` ≈ 0.985 (short glide). Reference food apps glide longer —
 * use a higher rate so one flick covers more content without snap/paging hacks.
 * iOS keeps platform `normal` (≈ 0.998).
 */
const ANDROID_DECEL = 0.994;

export function naturalDecelerationRate(os: string): "normal" | number {
  return os === "ios" ? "normal" : ANDROID_DECEL;
}

/** Velocity below this (pt/ms) after finger-up means no meaningful fling. */
export const SCROLL_FLING_VELOCITY_EPS = 0.12;

export type NaturalHorizontalScrollProps = {
  horizontal: true;
  nestedScrollEnabled: true;
  showsHorizontalScrollIndicator: false;
  decelerationRate: "normal" | number;
  overScrollMode: "never";
  bounces: true;
  alwaysBounceHorizontal: false;
  directionalLockEnabled: true;
  delaysContentTouches: false;
  keyboardShouldPersistTaps: "handled";
  disableIntervalMomentum: false;
};

export type NaturalVerticalScrollProps = {
  nestedScrollEnabled: true;
  showsVerticalScrollIndicator: false;
  decelerationRate: "normal" | number;
  overScrollMode: "never";
  directionalLockEnabled: true;
  delaysContentTouches: false;
  keyboardShouldPersistTaps: "always";
};

/** Horizontal free-scroll carousels nested inside a vertical list. */
export function buildNaturalHorizontalScrollProps(os: string): NaturalHorizontalScrollProps {
  return {
    horizontal: true,
    nestedScrollEnabled: true,
    showsHorizontalScrollIndicator: false,
    decelerationRate: naturalDecelerationRate(os),
    overScrollMode: "never",
    bounces: true,
    alwaysBounceHorizontal: false,
    directionalLockEnabled: true,
    delaysContentTouches: false,
    keyboardShouldPersistTaps: "handled",
    disableIntervalMomentum: false,
  };
}

/** Vertical lists (FlashList / FlatList / ScrollView) — natural fling, clean end. */
export function buildNaturalVerticalScrollProps(os: string): NaturalVerticalScrollProps {
  return {
    nestedScrollEnabled: true,
    showsVerticalScrollIndicator: false,
    decelerationRate: naturalDecelerationRate(os),
    overScrollMode: "never",
    directionalLockEnabled: true,
    delaysContentTouches: false,
    keyboardShouldPersistTaps: "always",
  };
}
