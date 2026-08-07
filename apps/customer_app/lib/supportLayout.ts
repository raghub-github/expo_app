/** Top padding for support stack headers — matches My Support home. */
export function supportHeaderPaddingTop(safeAreaTop: number): number {
  return Math.max(safeAreaTop - 8, 0);
}
