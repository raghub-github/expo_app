/** Matches support list, raise wizard, and inner ticket chat. */
export const SUPPORT_PAGE_BG = "#F5F5F5";

/**
 * Top padding for support headers.
 * Root layout already reserves the status-bar strip — do not add insets.top again.
 */
export function supportHeaderPaddingTop(_safeAreaTop?: number): number {
  return 0;
}
