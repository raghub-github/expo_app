import React from "react";
import type { MerchantScrollListHandle } from "../components/MerchantDetailFlashList";
import { MENU_SCROLL_STICKY_OFFSET } from "../constants/layout";

export type { MerchantScrollListHandle };

export function scrollFlashListToOffset(
  ref: React.RefObject<MerchantScrollListHandle | null>,
  offset: number,
  animated = true
) {
  ref.current?.scrollToOffset({ offset, animated });
}

export function scrollFlashListToFlatIndex(
  ref: React.RefObject<MerchantScrollListHandle | null>,
  flatIndex: number,
  animated = true,
  viewOffset = MENU_SCROLL_STICKY_OFFSET
) {
  ref.current?.scrollToIndex({
    index: flatIndex,
    animated,
    viewOffset,
  });
}

export function scrollFlashListToIndex(
  ref: React.RefObject<MerchantScrollListHandle | null>,
  index: number,
  animated = true
) {
  scrollFlashListToFlatIndex(ref, index, animated);
}
