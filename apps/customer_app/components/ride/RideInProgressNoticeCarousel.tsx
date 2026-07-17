import { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, StyleSheet, Dimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { RIDE_TOLL_NOTICE_DISPLAY, shouldShowRideTollNotice } from "@/lib/ride-toll-notice";

const SCREEN_W = Dimensions.get("window").width;
const H_PAD = 16;
const SLIDE_W = SCREEN_W - H_PAD * 2;
const AUTO_MS = 5000;

const RIDE_IN_PROGRESS_NOTICES = [RIDE_TOLL_NOTICE_DISPLAY];

type Props = {
  rideType?: string | null;
};

export function RideInProgressNoticeCarousel({ rideType }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const showTollNotice = shouldShowRideTollNotice(rideType);
  const multi = RIDE_IN_PROGRESS_NOTICES.length > 1;

  useEffect(() => {
    if (!multi) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % RIDE_IN_PROGRESS_NOTICES.length;
        scrollRef.current?.scrollTo({ x: next * SLIDE_W, animated: true });
        return next;
      });
    }, AUTO_MS);
    return () => clearInterval(timer);
  }, [multi]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!multi) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SLIDE_W);
    setActiveIndex(Math.max(0, Math.min(idx, RIDE_IN_PROGRESS_NOTICES.length - 1)));
  }, [multi]);

  if (!showTollNotice) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={multi}
        scrollEnabled={multi}
        showsHorizontalScrollIndicator={false}
        snapToInterval={multi ? SLIDE_W : undefined}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {RIDE_IN_PROGRESS_NOTICES.map((notice) => (
          <View key={notice} style={[styles.slide, { width: SLIDE_W }]}>
            <AppText style={styles.noticeText}>{notice}</AppText>
          </View>
        ))}
      </ScrollView>
      {multi ? (
        <View style={styles.dotsRow}>
          {RIDE_IN_PROGRESS_NOTICES.map((notice, i) => (
            <View
              key={notice}
              style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFBEB",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#FDE68A",
  },
  scrollContent: {
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
  },
  slide: {
    justifyContent: "center",
    minHeight: 40,
  },
  noticeText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1C1917",
    lineHeight: 18,
    textAlign: "center",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingBottom: 8,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  dotActive: {
    width: 14,
    backgroundColor: "#D97706",
  },
  dotInactive: {
    width: 5,
    backgroundColor: "#FCD34D",
  },
});
