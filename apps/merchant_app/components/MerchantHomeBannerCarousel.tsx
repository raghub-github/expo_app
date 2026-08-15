import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

export type MerchantHomeBannerSlide = {
  id: string;
  durationMs?: number;
  element: React.ReactNode;
};

const DEFAULT_DURATION_MS = 30_000;
export const MERCHANT_HOME_BANNER_HEIGHT = 50;

type Props = {
  slides: MerchantHomeBannerSlide[];
  /** `flush` = edge-to-edge (default). `inset` keeps side padding. */
  variant?: "inset" | "flush";
};

/**
 * Horizontal status banner carousel — one card visible at a time, snap paging, 30s loop.
 */
export function MerchantHomeBannerCarousel({ slides, variant = "flush" }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const listRef = useRef<FlatList<MerchantHomeBannerSlide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndexRef = useRef(0);
  const userDraggingRef = useRef(false);
  const slidesRef = useRef<MerchantHomeBannerSlide[]>(slides);
  const containerWidthRef = useRef(0);

  const slideKey = slides.map((s) => s.id).join("|");
  const multi = slides.length > 1;
  const slideWidth = containerWidth > 0 ? containerWidth : 1;

  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goTo = useCallback((index: number, animated = true) => {
    const current = slidesRef.current;
    const width = containerWidthRef.current;
    if (!listRef.current || current.length === 0 || width <= 0) return;
    const next = ((index % current.length) + current.length) % current.length;
    activeIndexRef.current = next;
    setActiveIndex(next);
    listRef.current.scrollToOffset({ offset: next * width, animated });
  }, []);

  const scheduleAdvance = useCallback(() => {
    clearTimer();
    const current = slidesRef.current;
    if (current.length <= 1 || userDraggingRef.current) return;
    const cur = current[activeIndexRef.current];
    const ms = cur?.durationMs ?? DEFAULT_DURATION_MS;
    timerRef.current = setTimeout(() => {
      if (userDraggingRef.current) return;
      goTo(activeIndexRef.current + 1);
    }, ms);
  }, [clearTimer, goTo]);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    userDraggingRef.current = false;
    if (containerWidth > 0 && slides.length > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    scheduleAdvance();
    return clearTimer;
  }, [slideKey, containerWidth, slides.length, scheduleAdvance, clearTimer]);

  useEffect(() => {
    scheduleAdvance();
    return clearTimer;
  }, [activeIndex, scheduleAdvance, clearTimer]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== containerWidth) {
      containerWidthRef.current = w;
      setContainerWidth(w);
    }
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (containerWidth <= 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    const clamped = Math.max(0, Math.min(slides.length - 1, idx));
    activeIndexRef.current = clamped;
    setActiveIndex(clamped);
    userDraggingRef.current = false;
    scheduleAdvance();
  };

  const pager = useMemo(() => {
    if (!multi) return null;
    return (
      <View style={styles.pagerOverlay} pointerEvents="none">
        {slides.map((s, i) => (
          <View key={s.id} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    );
  }, [activeIndex, multi, slides]);

  if (slides.length === 0) return null;

  return (
    <View style={[styles.wrap, variant === "flush" && styles.wrapFlush]} onLayout={onLayout}>
      <View style={styles.card}>
        {containerWidth > 0 ? (
          <FlatList
            ref={listRef}
            data={slides}
            extraData={activeIndex}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            nestedScrollEnabled
            removeClippedSubviews={false}
            showsHorizontalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            scrollEnabled={multi}
            decelerationRate="fast"
            snapToInterval={slideWidth}
            snapToAlignment="start"
            disableIntervalMomentum
            getItemLayout={(_, index) => ({
              length: slideWidth,
              offset: slideWidth * index,
              index,
            })}
            onScrollBeginDrag={() => {
              userDraggingRef.current = true;
              clearTimer();
            }}
            onScrollEndDrag={(e) => {
              if (containerWidth <= 0) return;
              const velocityX = e.nativeEvent.velocity?.x ?? 0;
              if (Math.abs(velocityX) < 0.05) {
                const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
                const clamped = Math.max(0, Math.min(slides.length - 1, idx));
                activeIndexRef.current = clamped;
                setActiveIndex(clamped);
                userDraggingRef.current = false;
                scheduleAdvance();
              }
            }}
            onMomentumScrollEnd={onMomentumEnd}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width: slideWidth }]}>{item.element}</View>
            )}
          />
        ) : (
          <View style={styles.slide}>{slides[0]?.element}</View>
        )}
        {pager}
      </View>
    </View>
  );
}

export function MerchantClosedStoreBanner({
  text,
  onPress,
}: {
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.closedBanner}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text.replace(/\n/g, " ")}
    >
      <Ionicons name="calendar-outline" size={20} color={GatiMitraMerchant.warning} />
      <Text style={styles.closedText} numberOfLines={3}>
        {text}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textSecondary} />
    </Pressable>
  );
}

export function MerchantScheduleOffBanner({
  phase,
  windowText,
  reason,
  sourceLabel,
  onPress,
}: {
  phase: "active" | "upcoming";
  windowText: string;
  reason?: string | null;
  sourceLabel?: string | null;
  onPress: () => void;
}) {
  const line = [
    phase === "active" ? "Active" : "Upcoming",
    windowText,
    reason ? String(reason) : null,
    sourceLabel ? `via ${sourceLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      style={styles.closedBanner}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Scheduled time-off. ${line}`}
    >
      <Ionicons name="calendar-outline" size={18} color={GatiMitraMerchant.warning} />
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerEyebrow}>Scheduled time-off</Text>
        <Text style={styles.closedText} numberOfLines={1}>
          <Text style={phase === "active" ? styles.phaseActive : styles.phaseUpcoming}>
            {phase === "active" ? "Active" : "Upcoming"}
          </Text>
          {" · "}
          {windowText}
          {reason ? ` · ${reason}` : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={GatiMitraMerchant.textSecondary} />
    </Pressable>
  );
}

export function MerchantRushHourBanner({
  remainingMinutes,
  sourceLabel,
  onPress,
}: {
  remainingMinutes: number;
  sourceLabel?: string | null;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Ionicons name="flash-outline" size={20} color="#C2410C" />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerEyebrow, { color: "#9A3412" }]}>Rush hour</Text>
        <Text style={styles.closedText} numberOfLines={2}>
          <Text style={styles.phaseActive}>Active</Text>
          {` · ~${remainingMinutes} min left`}
          {sourceLabel ? ` · via ${sourceLabel}` : ""}
        </Text>
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textSecondary} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.closedBanner, styles.rushBanner]}>{body}</View>;
  }

  return (
    <Pressable
      style={[styles.closedBanner, styles.rushBanner]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Rush hour active. About ${remainingMinutes} minutes left`}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: H_PADDING,
    marginTop: 0,
    marginBottom: 0,
  },
  wrapFlush: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  card: {
    borderRadius: 0,
    overflow: "hidden",
    height: MERCHANT_HOME_BANNER_HEIGHT,
  },
  slide: {
    height: MERCHANT_HOME_BANNER_HEIGHT,
    overflow: "hidden",
  },
  pagerOverlay: {
    position: "absolute",
    right: 10,
    bottom: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pagerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    minHeight: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    width: 12,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#FFFFFF",
  },
  closedBanner: {
    flex: 1,
    height: MERCHANT_HOME_BANNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 0,
    paddingVertical: 6,
    paddingHorizontal: 14,
    paddingRight: 40,
    borderRadius: 0,
    backgroundColor: "#FEF3C7",
    borderWidth: 0,
    minHeight: MERCHANT_HOME_BANNER_HEIGHT,
  },
  rushBanner: {
    backgroundColor: "#FFF7ED",
    borderBottomColor: "#FDBA7455",
  },
  bannerCopy: {
    flex: 1,
    minWidth: 0,
  },
  bannerEyebrow: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#78350F",
    marginBottom: 1,
  },
  closedText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 16,
  },
  phaseActive: {
    fontWeight: "800",
    color: "#9F1239",
  },
  phaseUpcoming: {
    fontWeight: "800",
    color: "#92400E",
  },
});
