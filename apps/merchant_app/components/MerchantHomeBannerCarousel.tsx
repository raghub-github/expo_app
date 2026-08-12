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

const DEFAULT_DURATION_MS = 8_000;
export const MERCHANT_HOME_BANNER_HEIGHT = 56;

type Props = {
  slides: MerchantHomeBannerSlide[];
};

/**
 * Horizontal status banner carousel (same interaction pattern as rider home alerts).
 */
export function MerchantHomeBannerCarousel({ slides }: Props) {
  const [containerWidth, setContainerWidth] = useState(0);
  const listRef = useRef<FlatList<MerchantHomeBannerSlide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeIndexRef = useRef(0);
  const userDraggingRef = useRef(false);

  const slideWidth = containerWidth > 0 ? containerWidth : 1;
  const multi = slides.length > 1;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const goTo = useCallback(
    (index: number, animated = true) => {
      if (!listRef.current || slides.length === 0 || containerWidth <= 0) return;
      const next = ((index % slides.length) + slides.length) % slides.length;
      activeIndexRef.current = next;
      setActiveIndex(next);
      listRef.current.scrollToIndex({ index: next, animated });
    },
    [containerWidth, slides.length]
  );

  const scheduleAdvance = useCallback(() => {
    clearTimer();
    if (!multi || userDraggingRef.current) return;
    const cur = slides[activeIndexRef.current];
    const ms = cur?.durationMs ?? DEFAULT_DURATION_MS;
    timerRef.current = setTimeout(() => {
      goTo(activeIndexRef.current + 1);
    }, ms);
  }, [clearTimer, goTo, multi, slides]);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    if (containerWidth > 0 && slides.length > 0) {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
    scheduleAdvance();
    return clearTimer;
  }, [slides, containerWidth, scheduleAdvance, clearTimer]);

  useEffect(() => {
    scheduleAdvance();
    return clearTimer;
  }, [activeIndex, scheduleAdvance, clearTimer]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== containerWidth) setContainerWidth(w);
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
      <View style={styles.pagerRow} pointerEvents="none">
        {slides.map((s, i) => (
          <View key={s.id} style={[styles.dot, i === activeIndex && styles.dotActive]} />
        ))}
      </View>
    );
  }, [activeIndex, multi, slides]);

  if (slides.length === 0) return null;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {containerWidth > 0 ? (
        <FlatList
          ref={listRef}
          data={slides}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={multi}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            length: slideWidth,
            offset: slideWidth * index,
            index,
          })}
          onScrollBeginDrag={() => {
            userDraggingRef.current = true;
            clearTimer();
          }}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item }) => (
            <View style={{ width: slideWidth, minHeight: MERCHANT_HOME_BANNER_HEIGHT }}>{item.element}</View>
          )}
        />
      ) : (
        <View style={{ minHeight: MERCHANT_HOME_BANNER_HEIGHT }}>{slides[0]?.element}</View>
      )}
      {pager}
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
    marginHorizontal: -H_PADDING,
    marginBottom: 12,
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
    backgroundColor: "rgba(15,23,42,0.2)",
  },
  dotActive: {
    width: 14,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: GatiMitraMerchant.navy,
  },
  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 0,
    paddingVertical: 8,
    paddingHorizontal: H_PADDING,
    borderRadius: 0,
    backgroundColor: "#FEF3C7",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "#F59E0B55",
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
