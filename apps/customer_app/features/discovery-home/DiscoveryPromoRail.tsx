/**
 * Discovery CTA tiles — compact landscape chips (image + label).
 * Super-admin can add/remove tiles; an empty list hides the rail.
 */

import { useMemo } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import type { HomeBannerOffer } from "@/services/offers.service";
import {
  DEFAULT_DISCOVERY_CTA_LABELS,
  resolveDiscoveryDealsAtLabel,
  type DiscoveryCtaAction,
  type DiscoveryCtaTile,
} from "@/lib/foodHomeLayout";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { DiscoveryColors, DISCOVERY_PAGE_PAD } from "./discoveryTheme";

const CARD_H = 42;
const THUMB = 30;
const GAP = 5;
const ACCENTS = [DiscoveryColors.teal, DiscoveryColors.orange, DiscoveryColors.amber] as const;
const WASH = [
  ["#0F3D38", "#115E59"] as const,
  ["#431407", "#9A3412"] as const,
  ["#422006", "#A16207"] as const,
];

type Props = {
  tiles: DiscoveryCtaTile[];
  offers: HomeBannerOffer[];
  dealsAtMaxPrice: number;
  onMealsPress?: (tile: DiscoveryCtaTile) => void;
  onDealsPress?: () => void;
  onPackagingPress?: () => void;
};

function pickCrazyBadge(offers: HomeBannerOffer[]): string {
  let bestPct = 0;
  for (const o of offers) {
    const pct = Number(o.discount_percentage ?? 0);
    if (pct > bestPct) bestPct = pct;
  }
  if (bestPct > 0) return `${Math.round(bestPct)}%`;
  const title = offers[0]?.title?.trim();
  if (title && /\d+\s*%/i.test(title)) {
    const m = title.match(/(\d+)\s*%/);
    if (m) return `${m[1]}%`;
  }
  return "OFF";
}

function absUrl(raw?: string | null): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return toAbsoluteImageUrl(t) ?? t;
}

function captionFor(tile: DiscoveryCtaTile, dealsAtMaxPrice: number): string {
  const custom = tile.label?.trim();
  if (custom) return custom;
  if (tile.action === "meals") {
    return resolveDiscoveryDealsAtLabel(null, tile.maxPrice ?? dealsAtMaxPrice);
  }
  if (tile.action === "deals") return DEFAULT_DISCOVERY_CTA_LABELS.crazyDeals;
  return DEFAULT_DISCOVERY_CTA_LABELS.freePackaging;
}

function ChipMark({
  action,
  badge,
  amount,
}: {
  action: DiscoveryCtaAction;
  badge: string;
  amount: number;
}) {
  if (action === "meals") {
    return (
      <AppText style={styles.chipText} numberOfLines={1}>
        ₹{amount}
      </AppText>
    );
  }
  if (action === "deals") {
    return (
      <AppText style={styles.chipText} numberOfLines={1}>
        {badge}
      </AppText>
    );
  }
  return <Ionicons name="bag-handle" size={9} color="#111" />;
}

export function DiscoveryPromoRail({
  tiles,
  offers,
  dealsAtMaxPrice,
  onMealsPress,
  onDealsPress,
  onPackagingPress,
}: Props) {
  const crazyBadge = useMemo(() => pickCrazyBadge(offers), [offers]);

  if (!tiles.length) return null;

  return (
    <View style={styles.row}>
      {tiles.slice(0, 3).map((tile, index) => {
        const accent = ACCENTS[index % ACCENTS.length];
        const imageUrl = absUrl(tile.imageUrl);
        const amount = tile.maxPrice ?? dealsAtMaxPrice;
        const caption = captionFor(tile, dealsAtMaxPrice);
        return (
          <TouchableOpacity
            key={tile.id}
            activeOpacity={0.88}
            onPress={() => {
              if (tile.action === "meals") onMealsPress?.(tile);
              else if (tile.action === "deals") onDealsPress?.();
              else onPackagingPress?.();
            }}
            style={[styles.card, { borderColor: `${accent}55` }]}
          >
            <View style={styles.thumb}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={styles.image}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={imageUrl}
                  transition={0}
                />
              ) : (
                <LinearGradient colors={WASH[index % WASH.length]} style={styles.wash} />
              )}
              <View style={[styles.chip, { backgroundColor: accent }]}>
                <ChipMark action={tile.action} badge={crazyBadge} amount={amount} />
              </View>
            </View>
            <View style={styles.meta}>
              <AppText style={styles.caption} numberOfLines={2}>
                {caption}
              </AppText>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: GAP,
    paddingHorizontal: DISCOVERY_PAGE_PAD,
    paddingTop: 2,
    paddingBottom: 2,
  },
  card: {
    flex: 1,
    minWidth: 0,
    height: CARD_H,
    borderRadius: 11,
    overflow: "hidden",
    backgroundColor: DiscoveryColors.card,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 6,
    gap: 6,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#171717",
    flexShrink: 0,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  caption: {
    fontSize: 8,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 10,
    letterSpacing: 0.05,
  },
  chip: {
    position: "absolute",
    left: 1,
    bottom: 1,
    minWidth: 20,
    height: 12,
    paddingHorizontal: 3,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontSize: 6.5,
    fontWeight: "900",
    color: "#111",
    letterSpacing: -0.2,
  },
});
