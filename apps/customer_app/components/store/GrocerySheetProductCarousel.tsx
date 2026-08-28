import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { MenuItem } from "@/services/merchant.service";
import { isMerchantBrandOrPlaceholderImageUrl } from "@/lib/merchantHeroMedia";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

export const GROCERY_CAROUSEL_VISUAL_HEIGHT = 96;
const VISIBLE_SLOTS = 5;
const CENTER_SLOT = Math.floor(VISIBLE_SLOTS / 2);
const CAROUSEL_BG = "#FFFFFF";
const FOCUS_RING = "#137243";
const WHEEL_LIFT = 10;

type GrocerySheetProductCarouselProps = {
  items: MenuItem[];
  activeItemId: string;
  onSelectItem: (item: MenuItem) => void;
};

type LoopedCarouselItem = MenuItem & { __loopKey: string };

type CarouselRowProps = {
  item: MenuItem;
  index: number;
  itemStride: number;
  scrollX: Animated.Value;
  onPress: (item: MenuItem) => void;
};

function resolveCarouselImage(item: MenuItem): string | null {
  const raw = item.imageUrl?.trim();
  const abs = raw ? (toAbsoluteImageUrl(raw) ?? raw) : null;
  if (!abs || isMerchantBrandOrPlaceholderImageUrl(abs)) return null;
  return abs;
}

function loopPadForCount(count: number): number {
  if (count <= 1) return 0;
  return Math.min(CENTER_SLOT, count);
}

function realIndexFromLoopIndex(loopIndex: number, count: number, loopPad: number): number {
  const raw = loopIndex - loopPad;
  if (raw < 0) return count + raw;
  if (raw >= count) return raw - count;
  return raw;
}

function buildLoopedItems(items: MenuItem[], loopPad: number): LoopedCarouselItem[] {
  const head = items.slice(-loopPad);
  const tail = items.slice(0, loopPad);
  return [
    ...head.map((item, i) => ({ ...item, __loopKey: `h-${i}-${item.id}` })),
    ...items.map((item) => ({ ...item, __loopKey: `m-${item.id}` })),
    ...tail.map((item, i) => ({ ...item, __loopKey: `t-${i}-${item.id}` })),
  ];
}

function CarouselRow({ item, index, itemStride, scrollX, onPress }: CarouselRowProps) {
  const imageUri = resolveCarouselImage(item);
  const centerOffset = index * itemStride;

  const inputRange = [
    centerOffset - 2 * itemStride,
    centerOffset - itemStride,
    centerOffset,
    centerOffset + itemStride,
    centerOffset + 2 * itemStride,
  ];
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: [0.68, 0.82, 1.08, 0.82, 0.68],
    extrapolate: "clamp",
  });
  const translateY = scrollX.interpolate({
    inputRange,
    outputRange: [7, 4, -WHEEL_LIFT, 4, 7],
    extrapolate: "clamp",
  });
  const ringOpacity = scrollX.interpolate({
    inputRange: [centerOffset - itemStride, centerOffset, centerOffset + itemStride],
    outputRange: [0, 1, 0],
    extrapolate: "clamp",
  });

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={{ width: itemStride, height: GROCERY_CAROUSEL_VISUAL_HEIGHT }}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={styles.itemPress}>
        <Animated.View
          style={[styles.itemOuter, { transform: [{ translateY }, { scale }] }]}
        >
          <Animated.View style={[styles.focusRing, { opacity: ringOpacity }]} pointerEvents="none" />
          <View style={styles.thumb}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.thumbImage}
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={0}
              />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <Ionicons name="cube-outline" size={20} color="#9CA3AF" />
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

export function groceryCarouselBottomInset(itemCount: number, safeBottom: number): number {
  if (itemCount <= 1) return 0;
  return GROCERY_CAROUSEL_VISUAL_HEIGHT + safeBottom;
}

export function GrocerySheetProductCarousel({
  items,
  activeItemId,
  onSelectItem,
}: GrocerySheetProductCarouselProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const listRef = useRef<FlatList<LoopedCarouselItem>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const lastOffsetRef = useRef(0);
  const syncingRef = useRef(false);
  const internalSelectRef = useRef(false);
  const mountedRef = useRef(false);

  const itemStride = Math.max(56, Math.floor(windowWidth / VISIBLE_SLOTS));
  const sidePad = itemStride * CENTER_SLOT;
  const loopPad = loopPadForCount(items.length);
  const loopedItems = useMemo(
    () => (items.length <= 1 ? [] : buildLoopedItems(items, loopPad)),
    [items, loopPad]
  );

  const scrollToRealIndex = useCallback(
    (realIndex: number, animated: boolean) => {
      const clamped = Math.max(0, Math.min(items.length - 1, realIndex));
      const loopIndex = loopPad + clamped;
      const offset = loopIndex * itemStride;
      listRef.current?.scrollToOffset({ offset, animated });
      if (!animated) {
        scrollX.setValue(offset);
        lastOffsetRef.current = offset;
      }
    },
    [itemStride, items.length, loopPad, scrollX]
  );

  const jumpToOffset = useCallback(
    (offset: number) => {
      listRef.current?.scrollToOffset({ offset, animated: false });
      scrollX.setValue(offset);
      lastOffsetRef.current = offset;
    },
    [scrollX]
  );

  useEffect(() => {
    const index = items.findIndex((row) => String(row.id) === activeItemId);
    if (index < 0) return;

    const expectedOffset = (loopPad + index) * itemStride;
    const delta = Math.abs(lastOffsetRef.current - expectedOffset);

    if (!mountedRef.current) {
      mountedRef.current = true;
      const timer = setTimeout(() => scrollToRealIndex(index, false), 0);
      return () => clearTimeout(timer);
    }

    if (internalSelectRef.current) {
      internalSelectRef.current = false;
      if (delta < itemStride * 0.35) return;
    }

    if (delta < itemStride * 0.15) return;

    syncingRef.current = true;
    scrollToRealIndex(index, delta > itemStride * 0.5);
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }, [activeItemId, itemStride, items, loopPad, scrollToRealIndex]);

  useEffect(() => {
    mountedRef.current = false;
    lastOffsetRef.current = 0;
  }, [items.length, windowWidth]);

  const settleScroll = useCallback(
    (offset: number, notify: boolean) => {
      const loopIndex = Math.round(offset / itemStride);
      const n = items.length;

      if (loopIndex < loopPad) {
        const realIndex = realIndexFromLoopIndex(loopIndex, n, loopPad);
        const targetOffset = (loopPad + realIndex) * itemStride;
        jumpToOffset(targetOffset);
        if (notify) {
          const picked = items[realIndex];
          if (picked && String(picked.id) !== activeItemId) {
            internalSelectRef.current = true;
            onSelectItem(picked);
          }
        }
        return;
      }

      if (loopIndex >= loopPad + n) {
        const realIndex = realIndexFromLoopIndex(loopIndex, n, loopPad);
        const targetOffset = (loopPad + realIndex) * itemStride;
        jumpToOffset(targetOffset);
        if (notify) {
          const picked = items[realIndex];
          if (picked && String(picked.id) !== activeItemId) {
            internalSelectRef.current = true;
            onSelectItem(picked);
          }
        }
        return;
      }

      const realIndex = loopIndex - loopPad;
      if (notify && !syncingRef.current) {
        const picked = items[realIndex];
        if (picked && String(picked.id) !== activeItemId) {
          internalSelectRef.current = true;
          onSelectItem(picked);
        }
      }
    },
    [activeItemId, itemStride, items, jumpToOffset, loopPad, onSelectItem]
  );

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleScroll(event.nativeEvent.contentOffset.x, true);
    },
    [settleScroll]
  );

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          lastOffsetRef.current = event.nativeEvent.contentOffset.x;
        },
      }),
    [scrollX]
  );

  if (items.length <= 1) return null;

  const stripHeight = GROCERY_CAROUSEL_VISUAL_HEIGHT + insets.bottom;

  return (
    <View style={[styles.strip, { height: stripHeight }]} pointerEvents="box-none">
      <View style={[styles.stripFill, { height: stripHeight }]} />
      <Animated.FlatList
        ref={listRef}
        horizontal
        data={loopedItems}
        keyExtractor={(row) => row.__loopKey}
        showsHorizontalScrollIndicator={false}
        decelerationRate={Platform.OS === "ios" ? 0.992 : "fast"}
        snapToInterval={itemStride}
        snapToAlignment="start"
        disableIntervalMomentum
        bounces={false}
        style={styles.list}
        contentContainerStyle={{
          paddingHorizontal: sidePad,
          alignItems: "flex-end",
        }}
        getItemLayout={(_, index) => ({
          length: itemStride,
          offset: itemStride * index,
          index,
        })}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScrollEnd}
        onScrollEndDrag={onScrollEnd}
        renderItem={({ item, index }) => (
          <CarouselRow
            item={item}
            index={index}
            itemStride={itemStride}
            scrollX={scrollX}
            onPress={(row) => {
              const targetIndex = items.findIndex((r) => String(r.id) === String(row.id));
              if (targetIndex < 0) return;
              const picked = items[targetIndex];
              if (!picked || String(picked.id) === activeItemId) return;
              internalSelectRef.current = true;
              onSelectItem(picked);
              scrollToRealIndex(targetIndex, true);
            }}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    elevation: 20,
    overflow: "visible",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {},
    }),
  },
  stripFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: CAROUSEL_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(15,23,42,0.1)",
  },
  list: {
    flexGrow: 0,
    height: GROCERY_CAROUSEL_VISUAL_HEIGHT,
    overflow: "visible",
  },
  itemPress: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  itemOuter: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
  },
  focusRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 34,
    borderWidth: 2.5,
    borderColor: FOCUS_RING,
    backgroundColor: "transparent",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.1)",
  },
  thumbImage: {
    width: "88%",
    height: "88%",
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
