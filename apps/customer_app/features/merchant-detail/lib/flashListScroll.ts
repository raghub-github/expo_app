import React from "react";
import type { FlashListRef } from "@shopify/flash-list";
import type { MerchantFlashListItem } from "../types";
import { MENU_SCROLL_STICKY_OFFSET } from "../constants/layout";

export function scrollFlashListToOffset(
  ref: React.RefObject<FlashListRef<MerchantFlashListItem> | null>,
  offset: number,
  animated = true
) {
  ref.current?.scrollToOffset({ offset, animated });
}

export function scrollFlashListToFlatIndex(
  ref: React.RefObject<FlashListRef<MerchantFlashListItem> | null>,
  flatIndex: number,
  headerRowCount: number,
  animated = true
) {
  const listIndex = flatIndex - headerRowCount;
  if (listIndex < 0) {
    scrollFlashListToOffset(ref, 0, animated);
    return;
  }
  scrollFlashListToIndex(ref, listIndex, animated);
}

export function scrollFlashListToIndex(
  ref: React.RefObject<FlashListRef<MerchantFlashListItem> | null>,
  index: number,
  animated = true
) {
  ref.current?.scrollToIndex({
    index,
    animated,
    viewOffset: MENU_SCROLL_STICKY_OFFSET,
  });
}
