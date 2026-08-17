import { resolveTopSafeInset } from "@/constants/layout";

/** Top padding for support stack headers — clear of status bar (orders/support manage their own inset). */
export function supportHeaderPaddingTop(safeAreaTop: number): number {
  return resolveTopSafeInset(safeAreaTop) + 6;
}
