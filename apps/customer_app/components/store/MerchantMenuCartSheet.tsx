import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StoreTheme } from "@/constants/storeTheme";
import type { CartItem } from "@/store/cartStore";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

export const STORE_MERCHANT_SHEET_H_MARGIN = 12;
export const STORE_MERCHANT_SHEET_BOTTOM_GAP = 8;
export const MERCHANT_CART_CONTINUE_GREEN = StoreTheme.cartAction;
export const MERCHANT_CART_CONTINUE_GREEN_PRESSED = StoreTheme.cartActionPressed;
export const MERCHANT_CART_CONTINUE_PINK = "#E23744";
export const MERCHANT_CART_CONTINUE_PINK_PRESSED = "#CB202D";

const THUMB_SIZE = 32;
const THUMB_OVERLAP = 11;
const MAX_IMAGE_THUMBS = 2;
const OFFER_ROW_HEIGHT = 52;
const CONTINUE_PILL_HEIGHT = 54;
const CONTINUE_PILL_RADIUS = 14;
const SHEET_TOP_RADIUS = 20;
const SHEET_INNER_PAD_H = 12;
const SHEET_INNER_PAD_TOP = 10;
const OFFER_TO_PILL_GAP = 10;
/** Tight white pad under the green pill — matches reference, no large gap. */
const SHEET_BOTTOM_PAD = 6;

/** Exact dock height — offer strip + green pill + safe-area (stable list padding). */
export function resolveStoreContinueBarHeight(
  reserveOfferStrip: boolean,
  bottomInset: number
): number {
  const offerBlock = reserveOfferStrip
    ? OFFER_ROW_HEIGHT + OFFER_TO_PILL_GAP
    : SHEET_INNER_PAD_TOP;
  return (
    offerBlock +
    CONTINUE_PILL_HEIGHT +
    Math.max(0, bottomInset) +
    SHEET_BOTTOM_PAD
  );
}

/** Zomato cart-sheet scalloped % badge (contained — no layout overflow). */
export function CartSheetScallopedPercentBadge({ size = 34 }: { size?: number }) {
  const coreSize = Math.round(size * 0.74);
  const scallop = Math.max(4, Math.round(size * 0.11));
  return (
    <View style={[scallopStyles.wrap, { width: size, height: size }]}>
      {Array.from({ length: 10 }, (_, i) => (
        <View
          key={i}
          style={[
            scallopStyles.scallop,
            {
              width: scallop,
              height: scallop,
              borderRadius: scallop / 2,
              transform: [{ rotate: `${i * 36}deg` }, { translateY: -(size * 0.34) }],
            },
          ]}
        />
      ))}
      <View
        style={[
          scallopStyles.core,
          { width: coreSize, height: coreSize, borderRadius: coreSize / 2 },
        ]}
      >
        <Text style={[scallopStyles.pct, { fontSize: Math.round(coreSize * 0.4) }]}>%</Text>
      </View>
    </View>
  );
}

const scallopStyles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scallop: {
    position: "absolute",
    backgroundColor: StoreTheme.offerBlue,
  },
  core: {
    backgroundColor: StoreTheme.offerBlue,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  pct: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});

type ThumbItem = { key: string; uri: string | null };

const OFFER_BANNER_TITLE = "A Special Offer Has Been Unlocked";
const OFFER_BANNER_SUBTITLE = "Applicable discounts will be applied during checkout.";

function parseOfferCopy(text: string): { title: string; subtitle: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { title: OFFER_BANNER_TITLE, subtitle: OFFER_BANNER_SUBTITLE };
  }
  const split = trimmed.match(/^(.+?)\.\s*(.+)$/);
  if (split) {
    return { title: split[1].trim(), subtitle: split[2].trim() };
  }
  return { title: trimmed, subtitle: OFFER_BANNER_SUBTITLE };
}

/** Blue pricetag badge — offer strip + store info row. */
export function MerchantCartOfferBadge({ size = 26 }: { size?: number }) {
  const iconSize = Math.max(11, Math.round(size * 0.5));
  return (
    <View
      style={[
        badgeStyles.badge,
        { width: size, height: size, borderRadius: Math.max(6, Math.round(size * 0.28)) },
      ]}
    >
      <Ionicons name="pricetag" size={iconSize} color="#FFFFFF" />
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    backgroundColor: StoreTheme.offerBlue,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});

function Thumb({
  uri,
  index,
  total,
  variant = "image",
  accentColor,
}: {
  uri: string | null;
  index: number;
  total: number;
  variant?: "image" | "overflow";
  accentColor: string;
}) {
  const [failed, setFailed] = React.useState(false);
  const showImage = variant === "image" && !!uri && !failed;

  return (
    <View
      style={[
        styles.thumb,
        variant === "overflow" && { backgroundColor: accentColor },
        {
          marginLeft: index > 0 ? -(THUMB_SIZE - THUMB_OVERLAP) : 0,
          zIndex: total - index,
        },
      ]}
    >
      {variant === "overflow" ? (
        <MaterialCommunityIcons name="room-service-outline" size={16} color="#FFFFFF" />
      ) : showImage ? (
        <Image
          source={{ uri }}
          style={styles.thumbImg}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Ionicons name="restaurant" size={13} color="#9CA3AF" />
        </View>
      )}
    </View>
  );
}

function CartThumbStack({
  thumbs,
  totalCount,
  accentColor,
}: {
  thumbs: ThumbItem[];
  totalCount: number;
  accentColor: string;
}) {
  const imageThumbs = thumbs.slice(0, MAX_IMAGE_THUMBS);
  const showOverflow = totalCount > MAX_IMAGE_THUMBS;
  const slots = showOverflow
    ? [...imageThumbs, { key: "__overflow__", uri: null }]
    : imageThumbs.length > 0
      ? imageThumbs
      : [{ key: "__empty__", uri: null }];

  const stackWidth =
    THUMB_SIZE + Math.max(0, slots.length - 1) * (THUMB_SIZE - THUMB_OVERLAP);

  return (
    <View style={[styles.thumbStack, { width: stackWidth }]}>
      {slots.map((thumb, index) => (
        <Thumb
          key={thumb.key}
          uri={thumb.uri}
          index={index}
          total={slots.length}
          variant={thumb.key === "__overflow__" ? "overflow" : "image"}
          accentColor={accentColor}
        />
      ))}
    </View>
  );
}

export const STORE_CONTINUE_BAR_BODY_HEIGHT =
  SHEET_INNER_PAD_TOP + CONTINUE_PILL_HEIGHT + SHEET_BOTTOM_PAD;
export const STORE_CONTINUE_OFFER_BANNER_HEIGHT = OFFER_ROW_HEIGHT + OFFER_TO_PILL_GAP;

export type MerchantMenuCartSheetProps = {
  items: CartItem[];
  totalCount: number;
  onContinue: () => void;
  disabled?: boolean;
  isStoreClosed?: boolean;
  closedTitle?: string;
  offerBannerText?: string | null;
  bottomInset?: number;
  /** Keep offer row height reserved before offer copy loads (prevents overlap jump). */
  reserveOfferStrip?: boolean;
};

/**
 * Zomato-style bottom tray — white sheet, offer strip, rounded green Continue pill.
 * Always docked to screen bottom (parent `cartDock`); safe-area sits under the pill.
 */
export function MerchantMenuCartSheet({
  items,
  totalCount,
  onContinue,
  disabled = false,
  isStoreClosed = false,
  closedTitle = "Store closed",
  offerBannerText = null,
  bottomInset = 0,
  reserveOfferStrip = false,
}: MerchantMenuCartSheetProps) {
  const thumbs = useMemo(() => {
    const seen = new Set<string>();
    const result: ThumbItem[] = [];
    for (const item of items) {
      const key = `${item.menuItemId ?? ""}:${item.variantId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const raw = item.imageUrl?.trim();
      result.push({
        key,
        uri: raw ? (toAbsoluteImageUrl(raw) ?? raw) : null,
      });
      if (result.length >= MAX_IMAGE_THUMBS) break;
    }
    return result;
  }, [items]);

  const itemLabel =
    totalCount === 1 ? "1 item added" : `${totalCount} items added`;

  const offerCopy = useMemo(
    () => (offerBannerText ? parseOfferCopy(offerBannerText) : null),
    [offerBannerText]
  );

  const showOfferStrip = reserveOfferStrip || !!offerCopy;

  const continueBg = isStoreClosed ? "#9CA3AF" : MERCHANT_CART_CONTINUE_GREEN;
  const safeBottom = Math.max(0, bottomInset) + SHEET_BOTTOM_PAD;

  return (
    <View style={[styles.bgSheet, { paddingBottom: safeBottom }]}>
      {showOfferStrip ? (
        <LinearGradient
          colors={["#E8F4FF", "#F7FBFF", "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.offerStrip}
        >
          <CartSheetScallopedPercentBadge size={34} />
          <View style={styles.offerTextCol}>
            {offerCopy ? (
              <>
                <Text style={styles.offerTitle} numberOfLines={2}>
                  {offerCopy.title}
                </Text>
                <Text style={styles.offerSubtitle} numberOfLines={2}>
                  {offerCopy.subtitle}
                </Text>
              </>
            ) : (
              <Text style={styles.offerSubtitle} numberOfLines={1}>
                {OFFER_BANNER_SUBTITLE}
              </Text>
            )}
          </View>
        </LinearGradient>
      ) : null}

      <View
        style={[
          styles.pillWrap,
          !showOfferStrip && styles.pillWrapNoOffer,
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onContinue}
          disabled={disabled}
          style={[
            styles.continuePill,
            { backgroundColor: continueBg },
            disabled && styles.continuePillDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={isStoreClosed ? closedTitle : `Continue with ${itemLabel}`}
        >
          <View style={styles.continueLeft}>
            <CartThumbStack
              thumbs={thumbs}
              totalCount={totalCount}
              accentColor={continueBg}
            />
            <Text style={styles.itemCountText} numberOfLines={1}>
              {isStoreClosed ? closedTitle : itemLabel}
            </Text>
          </View>

          {!isStoreClosed ? (
            <View style={styles.continueRight}>
              <Text style={styles.continueLabel}>Continue</Text>
              <Ionicons name="chevron-forward" size={17} color="#FFFFFF" />
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bgSheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: SHEET_TOP_RADIUS,
    borderTopRightRadius: SHEET_TOP_RADIUS,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#E8E8E8",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 18 },
    }),
  },
  offerStrip: {
    height: OFFER_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DCEEFF",
  },
  pillWrap: {
    paddingHorizontal: SHEET_INNER_PAD_H,
    paddingTop: OFFER_TO_PILL_GAP,
  },
  pillWrapNoOffer: {
    paddingTop: SHEET_INNER_PAD_TOP,
  },
  offerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  offerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#256FEF",
    lineHeight: 17,
  },
  offerSubtitle: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "400",
    color: "#696969",
    lineHeight: 14,
  },
  continuePill: {
    height: CONTINUE_PILL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderRadius: CONTINUE_PILL_RADIUS,
    backgroundColor: MERCHANT_CART_CONTINUE_GREEN,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  continuePillDisabled: {
    opacity: 0.85,
  },
  continueLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    paddingRight: 8,
  },
  thumbStack: {
    flexDirection: "row",
    alignItems: "center",
    height: THUMB_SIZE,
    flexShrink: 0,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbPlaceholder: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  itemCountText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  continueRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  continueLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
