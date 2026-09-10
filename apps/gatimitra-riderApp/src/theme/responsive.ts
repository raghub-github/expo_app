/**
 * GatiMitra Rider — central responsive layout helpers.
 *
 * Prefer flex + safe-area + these scale helpers over hardcoded screen hacks.
 * Pure functions so StyleSheet factories / hooks can share one source of truth.
 */

export const LAYOUT_BREAKPOINTS = {
  /** Very narrow phones / high display zoom */
  compact: 360,
  /** Typical phones */
  regular: 400,
  /** Large phones / small tablets */
  wide: 600,
} as const;

export type LayoutSizeClass = "compact" | "regular" | "wide";

export type ResponsiveMetrics = {
  width: number;
  height: number;
  fontScale: number;
  /** width / height — tall phones > ~0.45–0.5 inverted as aspect */
  aspectRatio: number;
  sizeClass: LayoutSizeClass;
  isCompactWidth: boolean;
  isShortHeight: boolean;
  isWide: boolean;
  /** Soft clamp of system fontScale for layout (never shrink below 1). */
  layoutFontScale: number;
};

/** Design reference — common Android mid-size phone. */
const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

/** Clamp helper used by all scale functions. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveSizeClass(width: number): LayoutSizeClass {
  if (width < LAYOUT_BREAKPOINTS.compact) return "compact";
  if (width >= LAYOUT_BREAKPOINTS.wide) return "wide";
  return "regular";
}

export function buildResponsiveMetrics(
  width: number,
  height: number,
  fontScale = 1
): ResponsiveMetrics {
  const safeW = Math.max(width, 1);
  const safeH = Math.max(height, 1);
  const layoutFontScale = clamp(fontScale, 1, 1.35);
  return {
    width: safeW,
    height: safeH,
    fontScale,
    aspectRatio: safeW / safeH,
    sizeClass: resolveSizeClass(safeW),
    isCompactWidth: safeW < LAYOUT_BREAKPOINTS.compact,
    isShortHeight: safeH < 640 || safeW / safeH > 0.62,
    isWide: safeW >= LAYOUT_BREAKPOINTS.wide,
    layoutFontScale,
  };
}

/**
 * Horizontal scale relative to design width.
 * Mild by default so 50–100% display zoom stays usable without tiny UI.
 */
export function responsiveWidth(
  size: number,
  screenWidth: number,
  options?: { min?: number; max?: number; factor?: number }
): number {
  const factor = options?.factor ?? 0.5;
  const scale = screenWidth / BASE_WIDTH;
  const moderated = size + (size * scale - size) * factor;
  return clamp(
    moderated,
    options?.min ?? size * 0.85,
    options?.max ?? size * 1.2
  );
}

/** Vertical scale — use sparingly; prefer flex for height. */
export function responsiveHeight(
  size: number,
  screenHeight: number,
  options?: { min?: number; max?: number; factor?: number }
): number {
  const factor = options?.factor ?? 0.35;
  const scale = screenHeight / BASE_HEIGHT;
  const moderated = size + (size * scale - size) * factor;
  return clamp(
    moderated,
    options?.min ?? size * 0.8,
    options?.max ?? size * 1.15
  );
}

/**
 * Font size that respects system fontScale without exploding layout.
 * Pass PixelRatio.getFontScale() or metrics.fontScale.
 */
export function responsiveFont(
  size: number,
  screenWidth: number,
  fontScale = 1,
  options?: { min?: number; max?: number }
): number {
  const widthScale = clamp(screenWidth / BASE_WIDTH, 0.88, 1.12);
  const fs = clamp(fontScale, 0.85, 1.45);
  const scaled = size * widthScale * (0.55 + fs * 0.45);
  return clamp(scaled, options?.min ?? size * 0.85, options?.max ?? size * 1.35);
}

/** Spacing that gently tracks width; keep visual hierarchy stable. */
export function responsiveSpacing(
  size: number,
  screenWidth: number,
  options?: { min?: number; max?: number }
): number {
  return responsiveWidth(size, screenWidth, {
    factor: 0.4,
    min: options?.min ?? Math.max(4, size * 0.75),
    max: options?.max ?? size * 1.25,
  });
}

export function responsiveIconSize(
  size: number,
  screenWidth: number,
  fontScale = 1
): number {
  const base = responsiveWidth(size, screenWidth, { factor: 0.35, min: size * 0.9, max: size * 1.15 });
  return Math.round(clamp(base * clamp(fontScale, 1, 1.25), 14, size * 1.35));
}

export function responsiveRadius(size: number, screenWidth: number): number {
  return Math.round(responsiveWidth(size, screenWidth, { factor: 0.3, min: size * 0.85, max: size * 1.15 }));
}

/** Minimum comfortable touch target (Material / Apple HIG ≈ 44–48). */
export const MIN_TOUCH_TARGET = 44;

export function ensureTouchTarget(size: number): number {
  return Math.max(size, MIN_TOUCH_TARGET);
}

/** Semantic spacing tokens — prefer these over magic numbers in new UI. */
export const spacingScale = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
} as const;

export type SpacingToken = keyof typeof spacingScale;

export function space(
  token: SpacingToken,
  screenWidth?: number
): number {
  const base = spacingScale[token];
  if (screenWidth == null) return base;
  return responsiveSpacing(base, screenWidth);
}
