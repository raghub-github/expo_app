/**
 * Global layout constants for status bar and header spacing.
 * Use these so all screens have consistent status bar visibility and no extra gaps.
 *
 * Rule: Root layout reserves status bar space (a colored strip) for all stacks
 * except profile (which uses native header with headerStatusBarHeight).
 * Screens under root should NOT add paddingTop for the status bar—only use
 * insets.top when the screen is the only one providing safe area (e.g. profile tab
 * content when root spacer is still applied).
 */

/** Default status bar height when insets are not yet available (e.g. 24dp Android). */
export const DEFAULT_STATUS_BAR_HEIGHT = 24;

/** Minimal vertical padding between status bar and header content when no root spacer (0 = compact). */
export const HEADER_TOP_PADDING_NONE = 0;

/** Use for header row padding (vertical) for readability only—no status bar compensation. */
export const HEADER_VERTICAL_PADDING = 12;

/**
 * Standard gap between status bar and header content.
 * Root layout already renders a status bar strip, so headers must use 0 here to avoid double spacing.
 * Reference: Home Page (tabs/index) uses no extra top padding; header starts immediately below the strip.
 */
export const HEADER_PADDING_TOP = 0;

/** Gap below root status-bar strip before screen header content (root already reserves insets.top). */
export const STATUS_BAR_TO_HEADER_GAP = 2;
