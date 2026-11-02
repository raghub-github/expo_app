/**
 * Zomato-style promo ad cards.
 * 2+ ads → 20s forward auto-slide loop (clone first after last = smooth, no jerk).
 * 1 ad → static.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import { FONT_LORA, FONT_LORA_BOLD, GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { subscribeMerchantHomeAdsRefresh } from "@/lib/merchantHomeAdsBus";
import { openHomeAdRedirect } from "@/lib/openHomeAdRedirect";
import {
  fetchMerchantHomeAds,
  invalidateMerchantHomeAdsCache,
  peekMerchantHomeAds,
  type HomeAd,
} from "@/services/homeAdsApi";

type Props = {
  placement: "home" | "orders";
};

const CARD_H = 128;
const CARD_RADIUS = 16;
const CTA_RADIUS = 20;
const AUTO_SLIDE_MS = 20_000;
/** Zomato-style: how much of the next card peeks on the right (2+ ads). */
const NEXT_PEEK = 30;
const CARD_GAP = 10;

type SlideItem = { key: string; ad: HomeAd; realIndex: number; isClone: boolean };

function AdCard({
  ad,
  width,
  onCta,
}: {
  ad: HomeAd;
  width: number;
  onCta: (ad: HomeAd) => void;
}) {
  return (
    <View style={[styles.card, { width, height: CARD_H }]}>
      {ad.imageUrl ? (
        <Image source={{ uri: ad.imageUrl }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.imageFallback]} />
      )}
      <LinearGradient
        colors={["rgba(55,12,18,0.92)", "rgba(55,12,18,0.55)", "rgba(55,12,18,0.08)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradient}
      />
      <View style={styles.copy} pointerEvents="box-none">
        {ad.title || ad.body ? (
          <Text style={styles.promo} numberOfLines={3}>
            {ad.title ? <Text style={styles.title}>{ad.title.trim()}</Text> : null}
            {ad.title && ad.body ? <Text style={styles.title}>{" "}</Text> : null}
            {ad.body ? <Text style={styles.body}>{ad.body.trim()}</Text> : null}
          </Text>
        ) : null}
        {ad.ctaLabel ? (
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => onCta(ad)}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.ctaText}>{ad.ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function HomeAdsStrip({ placement }: Props) {
  const router = useRouter();
  const [ads, setAds] = useState<HomeAd[]>(() => peekMerchantHomeAds(placement));
  const [sheetAd, setSheetAd] = useState<HomeAd | null>(null);
  const [trackW, setTrackW] = useState(0);
  /** Dot / logical index into real ads (never the clone). */
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(true);

  const scrollRef = useRef<ScrollView>(null);
  /** Current page in the scroll list (may be clone page). */
  const pageRef = useRef(0);
  const adsLenRef = useRef(0);
  /** Scroll step = card width + gap (for snap / auto-slide). */
  const stepRef = useRef(0);
  const userPausedUntilRef = useRef(0);
  const resettingRef = useRef(false);

  adsLenRef.current = ads.length;

  const slides: SlideItem[] = useMemo(() => {
    if (ads.length === 0) return [];
    if (ads.length === 1) {
      return [{ key: `ad-${ads[0]!.id}`, ad: ads[0]!, realIndex: 0, isClone: false }];
    }
    const real = ads.map((ad, i) => ({
      key: `ad-${ad.id}`,
      ad,
      realIndex: i,
      isClone: false,
    }));
    // Clone of first after last → last→first is a forward slide, then silent reset.
    real.push({
      key: `ad-${ads[0]!.id}-clone`,
      ad: ads[0]!,
      realIndex: 0,
      isClone: true,
    });
    return real;
  }, [ads]);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) {
      setTrackW((prev) => (prev === w ? prev : w));
    }
  }, []);

  const load = useCallback(
    async (force = false) => {
      try {
        const next = await fetchMerchantHomeAds(placement, { force });
        setAds(next);
        setIndex((i) => {
          const clamped = next.length === 0 ? 0 : Math.min(i, next.length - 1);
          pageRef.current = clamped;
          return clamped;
        });
      } catch {
        /* keep cached */
      }
    },
    [placement]
  );

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Drop stale CTA actions (e.g. share) so redirect updates apply immediately.
      invalidateMerchantHomeAdsCache();
      void load(true);
      return () => setFocused(false);
    }, [load])
  );

  useEffect(() => {
    return subscribeMerchantHomeAdsRefresh(() => {
      const peeked = peekMerchantHomeAds(placement);
      setAds(peeked);
      void load(true);
    });
  }, [load, placement]);

  const scrollToPage = useCallback((page: number, animated: boolean) => {
    const step = stepRef.current;
    if (step <= 0) return;
    scrollRef.current?.scrollTo({ x: page * step, y: 0, animated });
    pageRef.current = page;
  }, []);

  /** After landing on clone of first, snap to real first with no animation. */
  const settleIfClone = useCallback(
    (page: number) => {
      const len = adsLenRef.current;
      if (len < 2) return;
      // Clone page index === ads.length
      if (page === len) {
        resettingRef.current = true;
        scrollToPage(0, false);
        pageRef.current = 0;
        setIndex(0);
        requestAnimationFrame(() => {
          resettingRef.current = false;
        });
        return;
      }
      const real = Math.max(0, Math.min(len - 1, page));
      pageRef.current = real;
      setIndex(real);
    },
    [scrollToPage]
  );

  // 2+ ads → auto-slide every 20s forward (including last → first via clone).
  useEffect(() => {
    if (ads.length < 2 || trackW <= 0 || !focused) return undefined;

    const tick = () => {
      if (AppState.currentState !== "active") return;
      if (Date.now() < userPausedUntilRef.current) return;
      if (resettingRef.current) return;
      const len = adsLenRef.current;
      if (len < 2) return;
      const nextPage = pageRef.current + 1;
      // pages: 0..len-1 real, len = clone of first
      const target = nextPage > len ? 0 : nextPage;
      scrollToPage(target, true);
      if (target === len) {
        // Wait for slide to finish, then silent reset to page 0.
        setTimeout(() => settleIfClone(len), 320);
        setIndex(0);
      } else {
        pageRef.current = target;
        setIndex(target);
      }
    };

    const id = setInterval(tick, AUTO_SLIDE_MS);
    return () => clearInterval(id);
  }, [ads.length, trackW, focused, scrollToPage, settleIfClone]);

  useEffect(() => {
    if (trackW <= 0 || ads.length === 0) return;
    const i = Math.min(pageRef.current, ads.length - 1);
    requestAnimationFrame(() => scrollToPage(i, false));
  }, [trackW, ads.length, scrollToPage]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (resettingRef.current) return;
      const step = stepRef.current;
      if (step <= 0) return;
      const page = Math.round(e.nativeEvent.contentOffset.x / step);
      settleIfClone(page);
      userPausedUntilRef.current = Date.now() + AUTO_SLIDE_MS;
    },
    [settleIfClone]
  );

  const onCta = useCallback(
    async (ad: HomeAd) => {
      const action = String(ad.ctaAction ?? "").toLowerCase();
      const url = (ad.ctaUrl ?? "").trim();

      if (action === "bottom_sheet") {
        setSheetAd(ad);
        return;
      }

      // Redirect (or in-app path) — never open the system share sheet.
      const inAppPath =
        url.startsWith("/") ||
        /^gatimitra:\/\//i.test(url) ||
        /^merchant:\/\//i.test(url);
      if (action === "redirect" || (url.length > 0 && action !== "share") || inAppPath) {
        if (!url) return;
        await openHomeAdRedirect(url, router);
        return;
      }

      // Explicit share only
      if (action === "share") {
        const message = [ad.title, ad.body, url].filter(Boolean).join("\n");
        if (!message) return;
        try {
          await Share.share({ message, url: url || undefined, title: ad.title || "Share" });
        } catch {
          if (url) void Linking.openURL(url).catch(() => {});
        }
      }
    },
    [router]
  );

  if (ads.length === 0) return null;

  const multi = ads.length >= 2;
  // 1 ad = full width; 2+ = leave NEXT_PEEK so the next card shows (Zomato-style).
  const cardW = trackW <= 0 ? 0 : multi ? Math.max(200, trackW - NEXT_PEEK) : trackW;
  const step = cardW > 0 ? cardW + CARD_GAP : 0;
  stepRef.current = step;

  return (
    <>
      <View
        style={[styles.wrap, multi && styles.wrapMulti]}
        onLayout={onTrackLayout}
      >
        {cardW > 0 ? (
          multi ? (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={step}
              snapToAlignment="start"
              disableIntervalMomentum
              bounces={false}
              overScrollMode="never"
              contentContainerStyle={styles.carouselRow}
              onScrollBeginDrag={() => {
                userPausedUntilRef.current = Date.now() + AUTO_SLIDE_MS;
              }}
              onMomentumScrollEnd={onMomentumEnd}
            >
              {slides.map((slide) => (
                <View key={slide.key} style={{ width: cardW, marginRight: CARD_GAP }}>
                  <AdCard ad={slide.ad} width={cardW} onCta={(a) => void onCta(a)} />
                </View>
              ))}
            </ScrollView>
          ) : (
            <AdCard ad={ads[0]!} width={cardW} onCta={(a) => void onCta(a)} />
          )
        ) : null}

        {multi ? (
          <View style={styles.dots} pointerEvents="none">
            {ads.map((ad, i) => (
              <View key={ad.id} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        ) : null}
      </View>

      <Modal
        visible={sheetAd != null}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetAd(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setSheetAd(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {sheetAd?.sheetTitle || sheetAd?.title ? (
              <Text style={styles.sheetTitle}>{sheetAd?.sheetTitle || sheetAd?.title}</Text>
            ) : null}
            {sheetAd?.sheetBody || sheetAd?.body ? (
              <Text style={styles.sheetBody}>{sheetAd?.sheetBody || sheetAd?.body}</Text>
            ) : null}
            {sheetAd?.ctaUrl?.trim() ? (
              <Pressable
                style={styles.sheetLinkBtn}
                onPress={() => {
                  void Linking.openURL(sheetAd.ctaUrl!.trim()).catch(() => {});
                }}
              >
                <Text style={styles.sheetLinkText}>{sheetAd.ctaLabel || "Open link"}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.sheetClose} onPress={() => setSheetAd(null)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    width: "100%",
    marginBottom: 10,
  },
  /** Break out of parent right padding so next-card peek reaches the screen edge. */
  wrapMulti: {
    marginRight: -H_PADDING,
  },
  carouselRow: {
    paddingRight: H_PADDING,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(15,23,42,0.22)",
  },
  dotActive: {
    width: 16,
    backgroundColor: GatiMitraMerchant.primary,
  },
  card: {
    borderRadius: CARD_RADIUS,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#4A1515",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    backgroundColor: "#6B1D1D",
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  copy: {
    flex: 1,
    width: "62%",
    justifyContent: "center",
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 12,
  },
  promo: {
    color: "#FFFFFF",
  },
  title: {
    fontFamily: FONT_LORA_BOLD,
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  body: {
    fontFamily: FONT_LORA,
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    lineHeight: 18,
  },
  cta: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: CTA_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    fontFamily: FONT_LORA_BOLD,
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
    fontSize: 13,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: "70%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 18,
    color: "#0F172A",
    marginBottom: 8,
  },
  sheetBody: {
    fontFamily: FONT_LORA,
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
  },
  sheetLinkBtn: {
    marginTop: 18,
    backgroundColor: "#03C3B2",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  sheetLinkText: {
    fontFamily: FONT_LORA_BOLD,
    color: "#FFFFFF",
    fontSize: 14,
  },
  sheetClose: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  sheetCloseText: {
    fontFamily: FONT_LORA,
    color: "#64748B",
    fontSize: 14,
  },
});
