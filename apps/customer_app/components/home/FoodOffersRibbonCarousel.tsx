/**
 * Food home offers row — glass cards on hero + clean row on white fallback.
 * Data from GET /v1/offers/featured.
 */

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import type { HomeBannerOffer } from "@/services/offers.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { AppText } from "@/components/AppText";
import { navigateToMerchant } from "@/lib/navigateToMerchant";
import { useQueryClient } from "@tanstack/react-query";
import type { MerchantSummary } from "@/services/merchant.service";
import { formatCardOfferLine } from "@/lib/merchantOfferBadge";
import { resolveMerchantBannerUri } from "@/lib/merchantBanner";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const SLIDE_GAP = 10;
const DEFAULT_CARD_H = 72;
const THUMB_SIZE = 54;
const CAROUSEL_AUTO_MS = 15_000;
const THUMB_CYCLE_MS = 2800;
const NAME_WRITE_MS = 52;
const NAME_HOLD_MS = 1600;
const NAME_WIPE_MS = 36;
const NEXT_PEEK = 56;
/** Reserved height at hero bottom for the floating offers row. */
export const FOOD_OFFERS_HERO_OVERLAP = 0;
export const FOOD_OFFERS_HERO_ROW_H = DEFAULT_CARD_H + 38;

const GLASS_CARD_BG = "rgba(255,255,255,0.78)";
const GLASS_CARD_BORDER = "rgba(255,255,255,0.62)";
const GLASS_TAB_BG = "rgba(255,255,255,0.88)";

function cardWidthForCount(count: number): number {
  if (count <= 1) return SCREEN_W - PAD * 2;
  const usable = SCREEN_W - PAD - NEXT_PEEK;
  if (count === 2) return Math.round(Math.min(usable, SCREEN_W * 0.68));
  return Math.round(Math.min(usable, SCREEN_W * 0.72));
}

const BADGE_TEXT = GatiMitraColors.deepMintStart;
const TITLE_COLOR = GatiMitraColors.textPrimaryNew;
const SUB_COLOR = GatiMitraColors.textSecondary;

type OfferCycleItem = {
  imageUrl: string;
  name: string;
};

type Slide = {
  id: string;
  title: string;
  sub: string;
  storeId: string;
  items: OfferCycleItem[];
};

function offerTitleWithItemName(title: string, typedName: string): string {
  const name = typedName.trim();
  if (!name) return title;
  const stripped = title
    .replace(/\s+on selected items?$/i, "")
    .replace(/\s+on all items$/i, "")
    .trim();
  if (/\bon$/i.test(stripped)) return `${stripped} ${name}`;
  return `${stripped} on ${name}`;
}

function isBogoOfferType(type: string | null | undefined): boolean {
  const t = String(type ?? "").toUpperCase();
  return t === "BOGO" || t === "BUY_X_GET_Y" || t === "BUY_N_GET_M";
}

function isCheckoutCartOfferType(type: string | null | undefined): boolean {
  const t = String(type ?? "").toUpperCase();
  return (
    t === "COUPON" ||
    t === "CART_PERCENTAGE" ||
    t === "CART_FLAT" ||
    t === "FREE_DELIVERY" ||
    t === "TIERED" ||
    t === "BUNDLE"
  );
}

/** Store Boost / BOGO / Precision only — never platform checkout coupons. */
function isStoreRibbonOffer(offer: HomeBannerOffer): boolean {
  if (offer.kind !== "merchant" || !offer.store_id?.trim()) return false;
  if (isCheckoutCartOfferType(offer.offer_type)) return false;
  if (isBogoOfferType(offer.offer_type)) return true;
  if (offer.conditions_mode === "boost" || offer.conditions_mode === "precision") return true;
  const t = String(offer.offer_type ?? "").toUpperCase();
  return t === "PERCENTAGE" || t === "FLAT" || t === "BOOST" || t === "PRECISION";
}

function isStoreRibbonHeadline(title: string): boolean {
  if (/^GatiMitra\s*·/i.test(title)) return false;
  if (/\buse code\b/i.test(title) || /\bcoupon\b/i.test(title)) return false;
  if (/^buy\s+\d+/i.test(title)) return true;
  if (/\bon (selected|all) items?\b/i.test(title)) return true;
  if (/\bupto\s+₹/i.test(title) || /\bup to\s+₹/i.test(title)) return true;
  return false;
}

function pickOffersForCarousel(offers: HomeBannerOffer[]): HomeBannerOffer[] {
  return offers.filter(isStoreRibbonOffer);
}

function absMediaUrl(raw: string | null | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "";
  return toAbsoluteImageUrl(trimmed) ?? trimmed;
}

function merchantsToSlides(merchants: MerchantSummary[]): Slide[] {
  const slides: Slide[] = [];
  for (const m of merchants) {
    const title = formatCardOfferLine(m.offerText);
    if (!title) continue;
    if (!isStoreRibbonHeadline(title)) continue;
    const items: OfferCycleItem[] = [];
    const seen = new Set<string>();
    const push = (raw: string | null | undefined) => {
      const abs = absMediaUrl(raw);
      if (!abs || seen.has(abs)) return;
      seen.add(abs);
      items.push({ imageUrl: abs, name: "" });
    };
    for (const u of m.galleryImages ?? []) push(u);
    push(m.displayImage);
    push(m.banner_url);
    push(resolveMerchantBannerUri(m));
    slides.push({
      id: `merchant-list-${m.id}`,
      title,
      sub: `At ${m.name?.trim() || "Restaurant"}`,
      storeId: m.id,
      items,
    });
    if (slides.length >= 6) break;
  }
  return slides;
}

function collectOfferItems(offer: HomeBannerOffer): OfferCycleItem[] {
  const urls = [...(offer.item_image_urls ?? [])];
  const names = [...(offer.item_names ?? [])];
  if (urls.length === 0 && offer.item_image_url) urls.push(offer.item_image_url);
  const len = Math.max(urls.length, names.length);
  const items: OfferCycleItem[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < len; i++) {
    const imageUrl = absMediaUrl(urls[i] ?? "");
    const name = String(names[i] ?? "").trim();
    if (!imageUrl && !name) continue;
    if (imageUrl && name && seen.has(`${imageUrl}|${name}`)) continue;
    if (imageUrl && name) seen.add(`${imageUrl}|${name}`);
    items.push({ imageUrl, name });
  }
  if (items.length === 0) {
    const fallback = absMediaUrl(offer.offer_image_url);
    if (fallback) items.push({ imageUrl: fallback, name: "" });
  }
  return items;
}

function offerToSlide(offer: HomeBannerOffer): Slide {
  const title = offer.title?.trim() || "Special offer for you";
  const sub =
    offer.sub?.trim() ||
    (offer.store_name?.trim() ? `At ${offer.store_name.trim()}` : "Explore on GatiMitra");
  return {
    id: offer.id,
    title,
    sub,
    storeId: offer.store_id?.trim() ?? "",
    items: collectOfferItems(offer),
  };
}

function PromoSlideCard({
  slide,
  cardWidth,
  cardHeight,
  onPress,
  variant = "default",
}: {
  slide: Slide;
  cardWidth: number;
  cardHeight: number;
  onPress: (slide: Slide) => void;
  variant?: "white" | "hero" | "default";
}) {
  const onWhiteBg = variant === "white";
  const onHero = variant === "hero";
  const items = slide.items;
  const itemsKey = items.map((it) => `${it.imageUrl}|${it.name}`).join("||");
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [itemIdx, setItemIdx] = useState(0);
  const [typedName, setTypedName] = useState("");
  const [failedKeys, setFailedKeys] = useState<Set<string>>(() => new Set());

  const cycleCount = items.length;
  const showNames = items.some((it) => it.name.length > 0);
  const activeItem = items[itemIdx];
  const thumbUri =
    activeItem?.imageUrl && !failedKeys.has(activeItem.imageUrl) ? activeItem.imageUrl : "";

  useEffect(() => {
    setItemIdx(0);
    setTypedName("");
    setFailedKeys(new Set());
  }, [itemsKey]);

  useEffect(() => {
    if (cycleCount === 0) return;

    if (!showNames) {
      if (cycleCount < 2) return;
      const timer = setInterval(() => {
        setItemIdx((prev) => (prev + 1) % cycleCount);
      }, THUMB_CYCLE_MS);
      return () => clearInterval(timer);
    }

    let cancelled = false;
    let idx = 0;
    let charCount = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const delay = (ms: number, fn: () => void) => {
      timeout = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const nameAt = () => itemsRef.current[idx]?.name?.trim() || "";
    const count = () => Math.max(itemsRef.current.length, 1);

    const writeName = () => {
      setItemIdx(idx);
      const name = nameAt();
      charCount = 0;
      setTypedName("");
      if (!name) {
        delay(NAME_HOLD_MS, goNext);
        return;
      }
      const tick = () => {
        charCount += 1;
        setTypedName(name.slice(0, charCount));
        if (charCount >= name.length) {
          delay(NAME_HOLD_MS, wipeName);
        } else {
          delay(NAME_WRITE_MS, tick);
        }
      };
      delay(NAME_WRITE_MS, tick);
    };

    const wipeName = () => {
      const name = nameAt();
      const tick = () => {
        charCount -= 1;
        setTypedName(name.slice(0, Math.max(charCount, 0)));
        if (charCount <= 0) {
          delay(120, goNext);
        } else {
          delay(NAME_WIPE_MS, tick);
        }
      };
      tick();
    };

    const goNext = () => {
      idx = (idx + 1) % count();
      writeName();
    };

    writeName();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [itemsKey, showNames, cycleCount]);

  return (
    <TouchableOpacity
      style={[
        styles.promoCard,
        onWhiteBg ? styles.promoCardOnWhite : null,
        onHero ? styles.promoCardOnHero : null,
        { width: cardWidth, height: cardHeight },
      ]}
      activeOpacity={0.92}
      onPress={() => onPress(slide)}
    >
      <View style={[styles.thumbWrap, onWhiteBg ? styles.thumbWrapOnWhite : null]}>
        {thumbUri ? (
          <Image
            source={{ uri: thumbUri }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            priority="high"
            onError={() =>
              setFailedKeys((s) => {
                const next = new Set(s);
                next.add(thumbUri);
                return next;
              })
            }
          />
        ) : (
          <View style={styles.thumbFallback} />
        )}
      </View>
      <View style={styles.promoTextCol}>
        <AppText style={styles.promoTitle} numberOfLines={1}>
          {showNames && typedName ? offerTitleWithItemName(slide.title, typedName) : slide.title}
        </AppText>
        <AppText style={styles.promoSub} numberOfLines={1}>
          {slide.sub}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

type Props = {
  offers?: HomeBannerOffer[];
  /** Nearby stores — used when featured API has no merchant rows yet. */
  merchantFallbacks?: MerchantSummary[];
  cardHeight?: number;
  showDefaultWhenEmpty?: boolean;
  embedOnHero?: boolean;
};

export function FoodOffersRibbonCarousel({
  offers = [],
  merchantFallbacks = [],
  cardHeight = DEFAULT_CARD_H,
  showDefaultWhenEmpty = false,
  embedOnHero = false,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const scrollRef = useRef<ScrollView>(null);
  const [, setActiveIndex] = useState(0);

  const slides: Slide[] = useMemo(() => {
    const picked = pickOffersForCarousel(offers);
    if (picked.length > 0) return picked.map(offerToSlide);
    const fromMerchants = merchantsToSlides(merchantFallbacks);
    if (fromMerchants.length > 0) return fromMerchants;
    return showDefaultWhenEmpty ? [] : [];
  }, [offers, merchantFallbacks, showDefaultWhenEmpty]);

  const cardW = cardWidthForCount(slides.length);
  const prefetchKey = slides
    .flatMap((s) => s.items.map((it) => it.imageUrl))
    .filter(Boolean)
    .join("|");

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [slides.length, cardW]);

  useEffect(() => {
    if (!prefetchKey) return;
    for (const uri of prefetchKey.split("|")) {
      if (uri) void Image.prefetch(uri, { cachePolicy: "memory-disk" }).catch(() => {});
    }
  }, [prefetchKey]);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % slides.length;
        scrollRef.current?.scrollTo({
          x: next * (cardW + SLIDE_GAP),
          animated: true,
        });
        return next;
      });
    }, CAROUSEL_AUTO_MS);
    return () => clearInterval(timer);
  }, [slides.length, cardW]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const idx = Math.round(x / (cardW + SLIDE_GAP));
      setActiveIndex(Math.max(0, Math.min(idx, slides.length - 1)));
    },
    [slides.length, cardW]
  );

  const handlePress = useCallback(
    (slide: Slide) => {
      if (slide.storeId) {
        navigateToMerchant(router, queryClient, slide.storeId);
        return;
      }
      router.push("/home" as never);
    },
    [router, queryClient]
  );

  if (slides.length === 0) {
    return null;
  }

  const cards = (
    <ScrollView
      ref={scrollRef}
      horizontal
      nestedScrollEnabled
      scrollEnabled={slides.length > 1}
      bounces={false}
      pagingEnabled={false}
      snapToInterval={cardW + SLIDE_GAP}
      snapToAlignment="start"
      decelerationRate="fast"
      showsHorizontalScrollIndicator={false}
      delaysContentTouches={false}
      keyboardShouldPersistTaps="handled"
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={styles.scrollContent}
    >
      {slides.map((slide) => (
        <PromoSlideCard
          key={slide.id}
          slide={slide}
          cardWidth={cardW}
          cardHeight={Math.max(cardHeight, DEFAULT_CARD_H)}
          onPress={handlePress}
          variant={embedOnHero ? "hero" : "white"}
        />
      ))}
    </ScrollView>
  );

  if (!embedOnHero) {
    return (
      <View style={styles.wrapOnWhite}>
        <AppText style={styles.headerOnWhite}>✦  OFFERS FOR YOU  ✦</AppText>
        {cards}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles.wrapOnHero]}>
      <View style={styles.tabRow} pointerEvents="none">
        <View style={styles.tabOnHero}>
          <AppText style={styles.tabText}>✦  OFFERS FOR YOU  ✦</AppText>
        </View>
      </View>
      <View style={styles.heroCards}>{cards}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 2,
    marginBottom: 8,
    overflow: "visible",
  },
  wrapOnWhite: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: "transparent",
  },
  wrapOnHero: {
    marginTop: 0,
    marginBottom: 0,
    paddingBottom: 6,
    zIndex: 3,
    elevation: 0,
    backgroundColor: "transparent",
  },
  headerOnWhite: {
    textAlign: "center",
    fontSize: 10,
    fontWeight: "800",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 1.05,
    marginBottom: 8,
  },
  tabRow: {
    alignItems: "center",
    zIndex: 2,
    marginBottom: 6,
  },
  tabOnHero: {
    backgroundColor: GLASS_TAB_BG,
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GLASS_CARD_BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  tabText: {
    fontSize: 10,
    fontWeight: "800",
    color: BADGE_TEXT,
    letterSpacing: 1.05,
  },
  heroCards: {
    backgroundColor: "transparent",
    paddingBottom: 4,
  },
  scrollContent: {
    gap: SLIDE_GAP,
    paddingHorizontal: PAD,
  },
  promoCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.softBackground,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 10,
  },
  promoCardOnWhite: {
    backgroundColor: GatiMitraColors.softBackground,
    borderWidth: 0,
  },
  promoCardOnHero: {
    backgroundColor: GLASS_CARD_BG,
    borderWidth: 0,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  thumbWrapOnWhite: {
    backgroundColor: GatiMitraColors.mintSoft,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    flexShrink: 0,
  },
  thumbFallback: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    backgroundColor: GatiMitraColors.mintSoft,
  },
  promoTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  promoTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: TITLE_COLOR,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  promoSub: {
    fontSize: 11,
    fontWeight: "500",
    color: SUB_COLOR,
    lineHeight: 14,
  },
});
