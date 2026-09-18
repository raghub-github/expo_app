/**
 * Classic food home category rail — All selected + circular categories with
 * per-category “FROM ₹” badges (lowest matching item). GatiMitra mint.
 */

import { ScrollView, StyleSheet, View } from "react-native";
import { NATURAL_HORIZONTAL_SCROLL_PROPS } from "@/lib/naturalScrollProps";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AppText } from "@/components/AppText";
import { InstantPressable } from "@/components/InstantPressable";
import type { FoodHomeCategoryItem } from "@/components/home/FoodHomeCategoryVariants";

type Props = {
  items: FoodHomeCategoryItem[];
  activeId?: string | null;
  allTabLabel?: string;
  allTabImageUrl?: string | null;
  /** Per-category lowest price — never a single shared fake price. */
  fromPricesById?: Record<string, number>;
  onSelectAll?: () => void;
  onSelect: (id: string, slug: string) => void;
};

const CIRCLE = 64;
const ITEM_W = 76;
const GAP = 10;
/** Extra space under the circle so the FROM pill sits below the image edge. */
const BADGE_DROP = 10;

export function ClassicFoodCategoryRail({
  items,
  activeId = "all",
  allTabLabel = "All",
  allTabImageUrl = null,
  fromPricesById = {},
  onSelectAll,
  onSelect,
}: Props) {
  const allActive = !activeId || activeId === "all";

  /** Low → high by FROM price when known; unmatched categories keep original order after priced ones. */
  const ordered = [...items].sort((a, b) => {
    const pa = fromPricesById[a.id];
    const pb = fromPricesById[b.id];
    if (pa != null && pb != null) return pa - pb;
    if (pa != null) return -1;
    if (pb != null) return 1;
    return 0;
  });

  return (
    <ScrollView {...NATURAL_HORIZONTAL_SCROLL_PROPS} contentContainerStyle={styles.row}>
      <InstantPressable
        style={styles.tile}
        pressedScale={0.96}
        onPress={() => onSelectAll?.()}
      >
        <View style={[styles.circle, allActive && styles.circleActive]}>
          <UserAppCategoryImage
            imageUrl={allTabImageUrl}
            cacheKey="classic-category-all"
            style={styles.image}
          />
        </View>
        <AppText style={[styles.label, allActive && styles.labelActive]} numberOfLines={1}>
          {allTabLabel}
        </AppText>
      </InstantPressable>

      {ordered.map((cat) => {
        const selected = activeId === cat.id;
        const from = fromPricesById[cat.id];
        const fromLabel =
          from != null && Number.isFinite(from) && from > 0
            ? `FROM ₹${Math.round(from)}`
            : null;
        return (
          <InstantPressable
            key={cat.id}
            style={styles.tile}
            pressedScale={0.96}
            onPress={() => onSelect(cat.id, cat.slug)}
          >
            <View style={styles.circleWrap}>
              <View style={[styles.circle, selected && styles.circleActive]}>
                <UserAppCategoryImage
                  imageUrl={cat.imageUrl}
                  cacheKey={`classic-category-${cat.id}`}
                  style={styles.image}
                />
              </View>
              {fromLabel ? (
                <View style={styles.fromBadge} pointerEvents="none">
                  <AppText style={styles.fromBadgeText}>{fromLabel}</AppText>
                </View>
              ) : null}
            </View>
            <AppText style={[styles.label, selected && styles.labelActive]} numberOfLines={2}>
              {cat.name}
            </AppText>
          </InstantPressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    gap: GAP,
    paddingTop: 2,
    paddingBottom: 2,
  },
  tile: {
    width: ITEM_W,
    alignItems: "center",
    paddingTop: 4,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  circleWrap: {
    width: CIRCLE + 4,
    height: CIRCLE + BADGE_DROP + 4,
    marginBottom: 2,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  circleActive: {
    borderColor: GatiMitraColors.primaryMint,
    backgroundColor: "rgba(34, 197, 94, 0.08)",
  },
  image: {
    width: CIRCLE,
    height: CIRCLE,
  },
  fromBadge: {
    position: "absolute",
    bottom: -2,
    alignSelf: "center",
    backgroundColor: GatiMitraColors.primaryMint,
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 3,
    maxWidth: ITEM_W,
  },
  fromBadgeText: {
    fontSize: 8,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
    width: ITEM_W - 4,
  },
  labelActive: {
    fontWeight: "800",
    color: GatiMitraColors.deepMintStart,
  },
});
