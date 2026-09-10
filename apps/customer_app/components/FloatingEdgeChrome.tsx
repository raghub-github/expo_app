import { EDGE_PEEK_ROW_GAP } from "@/components/EdgePeekTab";
import { FLOATING_CART_BAR_HEIGHT } from "@/constants/layout";

/** Horizontal inset on the cart/nav bar so it does not cover the edge tab. */
export const FLOATING_EDGE_TAB_GAP = EDGE_PEEK_ROW_GAP;

/** @deprecated Edge peeks render inline beside cart/nav. */
export function FloatingEdgeChrome(): null {
  return null;
}

export const EDGE_CART_ROW_CLEARANCE = FLOATING_CART_BAR_HEIGHT;
