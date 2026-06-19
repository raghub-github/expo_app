import React, { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

export type HomeBannerSlideType =
  | "account_restricted"
  | "penalty"
  | "ride_payment_hold"
  | "subscription";

export type HomeBannerSlide = {
  id: string;
  type: HomeBannerSlideType;
  durationMs: number;
  element: React.ReactNode;
};

const DEFAULT_DURATION_MS: Record<HomeBannerSlideType, number> = {
  account_restricted: 10_000,
  penalty: 30_000,
  ride_payment_hold: 15_000,
  subscription: 15_000,
};

/** Shared height for top alert banners (icon + two text lines + CTA). */
export const BANNER_HEIGHT = 76;

export function homeBannerDuration(type: HomeBannerSlideType): number {
  return DEFAULT_DURATION_MS[type];
}

type BannerPagerContextValue = {
  visible: boolean;
  activeIndex: number;
  total: number;
};

const BannerPagerContext = createContext<BannerPagerContextValue>({
  visible: false,
  activeIndex: 0,
  total: 0,
});

/** Carousel dots/lines — render below Support / Pay button. */
export function BannerPagerIndicators() {
  const { visible, activeIndex, total } = useContext(BannerPagerContext);
  if (!visible || total <= 1) return null;

  return (
    <View style={pagerStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[pagerStyles.dot, i === activeIndex ? pagerStyles.dotActive : null]}
        />
      ))}
    </View>
  );
}

const pagerStyles = StyleSheet.create({
  row: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
    minHeight: 10,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dotActive: {
    width: 12,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#ffffff",
  },
});

type Props = {
  slides: HomeBannerSlide[];
};

export function HomeAlertBannerCarousel({ slides }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const listRef = useRef<FlatList<HomeBannerSlide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndexRef = useRef(0);
  const userDraggingRef = useRef(false);
  const slidesRef = useRef<HomeBannerSlide[]>([]);
  const containerWidthRef = useRef(0);

  const visibleSlides = useMemo(() => slides.filter(Boolean), [slides]);
  const canScroll = visibleSlides.length > 1;

  useEffect(() => {
    slidesRef.current = visibleSlides;
  }, [visibleSlides]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    if (width <= 0) return;
    containerWidthRef.current = width;
    setContainerWidth(width);
  }, []);

  const clearAutoTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const syncIndexFromOffset = useCallback((offsetX: number) => {
    const count = slidesRef.current.length;
    const width = containerWidthRef.current;
    if (count === 0 || width <= 0) return;
    const nextIndex = Math.round(offsetX / width);
    const clamped = Math.min(Math.max(nextIndex, 0), count - 1);
    activeIndexRef.current = clamped;
    setActiveIndex(clamped);
  }, []);

  const scrollToIndex = useCallback((index: number, animated = true) => {
    const count = slidesRef.current.length;
    const width = containerWidthRef.current;
    if (count === 0 || width <= 0) return;
    const clamped = ((index % count) + count) % count;
    listRef.current?.scrollToOffset({ offset: clamped * width, animated });
    activeIndexRef.current = clamped;
    setActiveIndex(clamped);
  }, []);

  const scheduleAutoAdvance = useCallback(() => {
    clearAutoTimer();
    const currentSlides = slidesRef.current;
    if (currentSlides.length <= 1 || userDraggingRef.current) return;

    const current = currentSlides[activeIndexRef.current];
    const duration = current?.durationMs ?? 15_000;

    timerRef.current = setTimeout(() => {
      if (userDraggingRef.current) return;
      scrollToIndex(activeIndexRef.current + 1);
    }, duration);
  }, [clearAutoTimer, scrollToIndex]);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    userDraggingRef.current = false;
    if (visibleSlides.length > 0 && containerWidth > 0) {
      requestAnimationFrame(() => scrollToIndex(0, false));
    }
  }, [visibleSlides.length, scrollToIndex, containerWidth]);

  useEffect(() => {
    scheduleAutoAdvance();
    return clearAutoTimer;
  }, [activeIndex, scheduleAutoAdvance, clearAutoTimer, visibleSlides.length]);

  const handleScrollBeginDrag = useCallback(() => {
    userDraggingRef.current = true;
    clearAutoTimer();
  }, [clearAutoTimer]);

  const finishMomentumScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncIndexFromOffset(event.nativeEvent.contentOffset.x);
      userDraggingRef.current = false;
      scheduleAutoAdvance();
    },
    [scheduleAutoAdvance, syncIndexFromOffset]
  );

  const finishDragWithoutMomentum = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      syncIndexFromOffset(event.nativeEvent.contentOffset.x);
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocityX) < 0.05) {
        userDraggingRef.current = false;
        scheduleAutoAdvance();
      }
    },
    [scheduleAutoAdvance, syncIndexFromOffset]
  );

  const pagerValue = useMemo(
    (): BannerPagerContextValue => ({
      visible: canScroll,
      activeIndex,
      total: visibleSlides.length,
    }),
    [canScroll, activeIndex, visibleSlides.length]
  );

  if (visibleSlides.length === 0) return null;

  return (
    <BannerPagerContext.Provider value={pagerValue}>
      <View style={styles.wrap} onLayout={handleLayout}>
        {containerWidth > 0 ? (
          <FlatList
            ref={listRef}
            data={visibleSlides}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            bounces={false}
            scrollEnabled={canScroll}
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={containerWidth}
            snapToAlignment="start"
            disableIntervalMomentum
            onScrollBeginDrag={handleScrollBeginDrag}
            onScrollEndDrag={finishDragWithoutMomentum}
            onMomentumScrollEnd={finishMomentumScroll}
            getItemLayout={(_, index) => ({
              length: containerWidth,
              offset: containerWidth * index,
              index,
            })}
            style={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width: containerWidth }]}>
                {item.element}
              </View>
            )}
          />
        ) : null}
      </View>
    </BannerPagerContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    height: BANNER_HEIGHT,
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
  },
  list: {
    height: BANNER_HEIGHT,
    width: "100%",
  },
  slide: {
    height: BANNER_HEIGHT,
    overflow: "hidden",
  },
});
