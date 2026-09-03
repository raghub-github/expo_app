import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import { getCategoryImageLastGood } from "@/lib/categoryImageLastGood";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { FoodHomeCategoryItem } from "@/components/home/FoodHomeCategoryVariants";
import { AppText } from "@/components/AppText";
import { useCardAnimationsEnabled } from "@/hooks/useCardAnimationsEnabled";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

export type FoodHomeCategoryTabLayout = {
  itemW: number;
  columnGap: number;
  circle: number;
  imgSize: number;
  pagePadLeft: number;
  pagePadRight: number;
  /** Leftover width after sizing tabs — rendered as trailing space inside the row. */
  trailingSlack: number;
};

export const GRID_FIRST_CATEGORY_PAGE_COLUMNS = 5;
export const GRID_FIRST_CATEGORY_PAGE_PAD = 16;

const DEFAULT_LAYOUT: FoodHomeCategoryTabLayout = {
  itemW: 56,
  columnGap: 8,
  circle: 50,
  imgSize: 50,
  pagePadLeft: GRID_FIRST_CATEGORY_PAGE_PAD,
  pagePadRight: GRID_FIRST_CATEGORY_PAGE_PAD,
  trailingSlack: 0,
};

/** Exactly 5 tabs visible per page — used for grid-first category rail. */
export function computeGridFirstCategoryTabMetrics(
  windowWidth: number,
  horizontalSafeInset = 0
): FoodHomeCategoryTabLayout {
  const gap = 8;
  const pagePad = GRID_FIRST_CATEGORY_PAGE_PAD + Math.max(0, horizontalSafeInset);
  const cols = GRID_FIRST_CATEGORY_PAGE_COLUMNS;
  const inner = Math.max(0, windowWidth - pagePad * 2);
  const itemW = Math.floor((inner - gap * (cols - 1)) / cols);
  const used = itemW * cols + gap * (cols - 1);
  const trailingSlack = Math.max(0, inner - used);
  const circle = Math.min(48, Math.max(40, itemW - 6));
  const imgSize = circle;
  return {
    itemW,
    columnGap: gap,
    circle,
    imgSize,
    pagePadLeft: pagePad,
    pagePadRight: pagePad,
    trailingSlack,
  };
}

type TabEntry =
  | { kind: "under" }
  | { kind: "all" }
  | { kind: "category"; item: FoodHomeCategoryItem };

type Props = {
  items: FoodHomeCategoryItem[];
  onSelect: (id: string, slug: string) => void;
  activeId?: string;
  onActiveIdChange?: (id: string) => void;
  allTabLabel?: string;
  allTabImageUrl?: string | null;
  showUnderPriceTab?: boolean;
  underPriceLabel?: string;
  underPriceMaxPrice?: number;
  underPriceImageUrl?: string | null;
  onUnderPricePress?: () => void;
  layout?: FoodHomeCategoryTabLayout;
  /** Food home uses circles; grocery category rail uses rounded rectangles. */
  imageShape?: "circle" | "roundedRect";
};

function CategoryPhoto({
  imageUrl,
  cacheKey,
  layout,
  imageShape = "circle",
  fallbackIcon = "restaurant-outline",
}: {
  imageUrl?: string | null;
  cacheKey?: string;
  layout: FoodHomeCategoryTabLayout;
  imageShape?: "circle" | "roundedRect";
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const { circle } = layout;
  const lastGood = cacheKey ? getCategoryImageLastGood(cacheKey) : null;
  const resolvedUrl = imageUrl?.trim() || lastGood || null;
  const hasImage = !!resolvedUrl;
  const dark = useMerchantUiDark();
  const photoW = circle;
  const photoH =
    imageShape === "roundedRect" ? Math.round(circle * 1.22) : circle;
  const borderRadius =
    imageShape === "roundedRect"
      ? Math.max(10, Math.round(circle * 0.22))
      : circle / 2;

  return (
    <View
      style={{
        width: photoW,
        height: photoH,
        marginBottom: 6,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={[
          styles.photoClip,
          dark && styles.photoClipDark,
          {
            width: photoW,
            height: photoH,
            borderRadius,
          },
        ]}
      >
        {hasImage ? (
          <UserAppCategoryImage
            imageUrl={resolvedUrl}
            cacheKey={cacheKey}
            contentFit="cover"
            style={{ width: photoW, height: photoH }}
          />
        ) : (
          <View style={[styles.photoFallback, dark && styles.photoFallbackDark, StyleSheet.absoluteFillObject]}>
            <Ionicons
              name={fallbackIcon}
              size={Math.max(20, Math.round(Math.min(photoW, photoH) * 0.38))}
              color={dark ? MerchantDarkPalette.textMuted : "#94A3B8"}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function AnimatedExploreBar({ height }: { height: number }) {
  const pulse = useSharedValue(1);
  const chevronX = useSharedValue(0);
  const motionAllowed = useCardAnimationsEnabled();

  useEffect(() => {
    if (!motionAllowed) {
      cancelAnimation(pulse);
      cancelAnimation(chevronX);
      pulse.value = 1;
      chevronX.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
    chevronX.value = withRepeat(
      withSequence(
        withTiming(2.5, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 650, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [chevronX, pulse, motionAllowed]);

  const barStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chevronX.value }],
  }));

  return (
    <Animated.View style={[styles.exploreTab, barStyle, { height }]}>
      <AppText style={styles.exploreText}>Explore </AppText>
      <Animated.Text style={[styles.exploreChevron, chevronStyle]}>›</Animated.Text>
    </Animated.View>
  );
}

function MealsUnderExploreCard({
  width,
  height,
  maxPrice,
  imageUrl,
  onPress,
}: {
  width: number;
  height: number;
  maxPrice: number;
  imageUrl?: string | null;
  onPress?: () => void;
}) {
  const hasImage = !!imageUrl?.trim();
  const exploreBarH = Math.max(16, Math.round(height * 0.24));

  if (hasImage) {
    return (
      <TouchableOpacity
        style={[styles.tab, styles.tabTransparent, { width, minHeight: height + 9 }]}
        activeOpacity={0.85}
        onPress={onPress}
      >
        <View
          style={[
            styles.mealsCard,
            styles.mealsCardWithImage,
            {
              width,
              height,
              borderRadius: Math.max(10, Math.round(width * 0.2)),
            },
          ]}
        >
          <View style={styles.mealsCardBodyImage}>
            <UserAppCategoryImage
              imageUrl={imageUrl ?? null}
              cacheKey="tab-category-under-price"
              contentFit="contain"
              style={{ width, height: height - exploreBarH, backgroundColor: "transparent" }}
            />
          </View>
          <AnimatedExploreBar height={exploreBarH} />
        </View>
        <View style={styles.tabUnderlineSpacer} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.tab, { width, minHeight: height + 9 }]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View
        style={[
          styles.mealsCard,
          {
            width,
            height,
            borderRadius: Math.max(10, Math.round(width * 0.2)),
          },
        ]}
      >
        <View style={styles.mealsCardBody}>
          <View style={styles.mealsRibbon}>
            <AppText style={styles.mealsRibbonText} numberOfLines={1}>
              MEALS UNDER
            </AppText>
          </View>
          <AppText style={styles.mealsPrice} numberOfLines={1}>
            ₹{maxPrice}
          </AppText>
        </View>
        <AnimatedExploreBar height={exploreBarH} />
      </View>
      <View style={styles.tabUnderlineSpacer} />
    </TouchableOpacity>
  );
}

export function FoodHomeCategoryTabs({
  items,
  onSelect,
  activeId: activeIdProp,
  onActiveIdChange,
  allTabLabel = "All",
  allTabImageUrl,
  showUnderPriceTab = false,
  underPriceLabel = "Meals under ₹250",
  underPriceMaxPrice = 250,
  underPriceImageUrl,
  onUnderPricePress,
  layout: layoutProp,
  imageShape = "circle",
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const layout = layoutProp ?? computeGridFirstCategoryTabMetrics(windowWidth);
  const [internalActiveId, setInternalActiveId] = useState<string>("all");
  const activeId = activeIdProp ?? internalActiveId;
  const setActiveId = (id: string) => {
    if (activeIdProp == null) setInternalActiveId(id);
    onActiveIdChange?.(id);
  };

  const { itemW, columnGap, circle, pagePadLeft, pagePadRight } = layout;
  const mealsCardH = Math.round(circle * 1.34);
  const photoH =
    imageShape === "roundedRect" ? Math.round(circle * 1.22) : circle;
  const tabMinHeight = photoH + 38;
  const dark = useMerchantUiDark();
  const resolvedMaxPrice = useMemo(() => {
    if (Number.isFinite(underPriceMaxPrice) && underPriceMaxPrice > 0) {
      return Math.trunc(underPriceMaxPrice);
    }
    const fromLabel = /₹\s*(\d+)/.exec(underPriceLabel)?.[1];
    const parsed = fromLabel ? Number(fromLabel) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 250;
  }, [underPriceLabel, underPriceMaxPrice]);

  const entries = useMemo((): TabEntry[] => {
    const list: TabEntry[] = [];
    if (showUnderPriceTab) list.push({ kind: "under" });
    list.push({ kind: "all" });
    for (const item of items) list.push({ kind: "category", item });
    return list;
  }, [items, showUnderPriceTab]);

  const renderTab = (entry: TabEntry, key: string) => {
    if (entry.kind === "under") {
      return (
        <MealsUnderExploreCard
          key={key}
          width={itemW}
          height={mealsCardH}
          maxPrice={resolvedMaxPrice}
          imageUrl={underPriceImageUrl}
          onPress={onUnderPricePress}
        />
      );
    }

    if (entry.kind === "all") {
      const active = activeId === "all";
      return (
        <TouchableOpacity
          key={key}
          style={[styles.tab, { width: itemW, minHeight: tabMinHeight }]}
          activeOpacity={0.85}
          onPress={() => setActiveId("all")}
        >
          <CategoryPhoto
            imageUrl={allTabImageUrl}
            cacheKey="tab-category-all"
            layout={layout}
            imageShape={imageShape}
            fallbackIcon="apps-outline"
          />
          <AppText
            style={[
              styles.tabText,
              dark && styles.tabTextDark,
              { width: itemW },
              active && (dark ? styles.tabTextActiveDark : styles.tabTextActive),
            ]}
            numberOfLines={2}
          >
            {allTabLabel}
          </AppText>
          {active ? (
            <View style={[styles.tabUnderline, dark && styles.tabUnderlineDark]} />
          ) : (
            <View style={styles.tabUnderlineSpacer} />
          )}
        </TouchableOpacity>
      );
    }

    const cat = entry.item;
    const active = activeId === cat.id;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.tab, { width: itemW, minHeight: tabMinHeight }]}
        activeOpacity={0.85}
        onPress={() => {
          setActiveId(cat.id);
          onSelect(cat.id, cat.slug);
        }}
      >
        <CategoryPhoto
          imageUrl={cat.imageUrl}
          cacheKey={`tab-category-${cat.id}`}
          layout={layout}
          imageShape={imageShape}
        />
        <AppText
          style={[
            styles.tabText,
            dark && styles.tabTextDark,
            { width: itemW },
            active && (dark ? styles.tabTextActiveDark : styles.tabTextActive),
          ]}
          numberOfLines={2}
        >
          {cat.name}
        </AppText>
        {active ? (
          <View style={[styles.tabUnderline, dark && styles.tabUnderlineDark]} />
        ) : (
          <View style={styles.tabUnderlineSpacer} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      delaysContentTouches={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          paddingLeft: pagePadLeft,
          paddingRight: pagePadRight,
          gap: columnGap,
        },
      ]}
    >
      {entries.map((entry, index) =>
        renderTab(entry, `${entry.kind === "category" ? entry.item.id : entry.kind}-${index}`)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 0,
    paddingBottom: 0,
  },
  tab: {
    alignItems: "center",
  },
  tabTransparent: {
    backgroundColor: "transparent",
  },
  mealsCard: {
    backgroundColor: "#FFF7ED",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(251, 191, 36, 0.35)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: "column",
    overflow: "hidden",
  },
  mealsCardWithImage: {
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  mealsCardBody: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  mealsCardBodyImage: {
    flex: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  mealsRibbon: {
    backgroundColor: "#DC2626",
    paddingVertical: 2,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  mealsRibbonText: {
    color: "#FFFFFF",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  mealsPrice: {
    flex: 1,
    textAlign: "center",
    textAlignVertical: "center",
    color: "#1D4ED8",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
    includeFontPadding: false,
  },
  exploreTab: {
    width: "100%",
    flexDirection: "row",
    backgroundColor: GatiMitraColors.primaryMint,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  exploreText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
  exploreChevron: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  photoClip: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.06)",
  },
  photoClipDark: {
    backgroundColor: MerchantDarkPalette.elevated,
    borderColor: "rgba(255,255,255,0.08)",
  },
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  photoFallbackDark: {
    backgroundColor: MerchantDarkPalette.elevated,
  },
  tabText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#64748B",
    textAlign: "center",
  },
  tabTextDark: {
    color: MerchantDarkPalette.textMuted,
  },
  tabTextActive: {
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  tabTextActiveDark: {
    fontWeight: "700",
    color: MerchantDarkPalette.text,
  },
  tabUnderline: {
    marginTop: 4,
    height: 3,
    width: 28,
    borderRadius: 2,
    backgroundColor: "#E11D48",
  },
  tabUnderlineDark: {
    backgroundColor: MerchantDarkPalette.accent,
  },
  tabUnderlineSpacer: {
    marginTop: 4,
    height: 3,
    width: 28,
  },
});
