import { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { FoodHomeCategoryItem } from "@/components/home/FoodHomeCategoryVariants";

export type FoodHomeCategoryTabLayout = {
  itemW: number;
  columnGap: number;
  circle: number;
  imgSize: number;
};

const DEFAULT_LAYOUT: FoodHomeCategoryTabLayout = {
  itemW: 56,
  columnGap: 6,
  circle: 50,
  imgSize: 44,
};

type Props = {
  items: FoodHomeCategoryItem[];
  onSelect: (id: string, slug: string) => void;
  activeId?: string;
  onActiveIdChange?: (id: string) => void;
  /** Same metrics as classic home category rail (`computeCategoryRailMetrics`). */
  layout?: FoodHomeCategoryTabLayout;
};

function CategoryTabCircle({
  active,
  imageUrl,
  cacheKey,
  fallbackIcon = "grid-outline",
  layout,
}: {
  active: boolean;
  imageUrl?: string | null;
  cacheKey?: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  layout: FoodHomeCategoryTabLayout;
}) {
  const { circle, imgSize } = layout;
  const iconSize = Math.max(18, Math.round(circle * 0.4));
  const usePhoto = !!(imageUrl?.trim() || cacheKey);

  return (
    <View
      style={[
        styles.tabThumb,
        {
          width: circle,
          height: circle,
          borderRadius: circle / 2,
        },
        active && styles.tabThumbActive,
      ]}
    >
      {usePhoto ? (
        <UserAppCategoryImage
          imageUrl={imageUrl ?? null}
          cacheKey={cacheKey}
          style={{ width: imgSize, height: imgSize }}
        />
      ) : (
        <Ionicons
          name={fallbackIcon}
          size={iconSize}
          color={active ? GatiMitraColors.primaryMint : "#6B7280"}
        />
      )}
    </View>
  );
}

export function FoodHomeCategoryTabs({
  items,
  onSelect,
  activeId: activeIdProp,
  onActiveIdChange,
  layout = DEFAULT_LAYOUT,
}: Props) {
  const [internalActiveId, setInternalActiveId] = useState<string>("all");
  const activeId = activeIdProp ?? internalActiveId;
  const setActiveId = (id: string) => {
    if (activeIdProp == null) setInternalActiveId(id);
    onActiveIdChange?.(id);
  };

  const { itemW, columnGap, circle } = layout;
  const tabMinHeight = circle + 38;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.content, { gap: columnGap }]}
    >
      <TouchableOpacity
        style={[styles.tab, { width: itemW, minHeight: tabMinHeight }]}
        activeOpacity={0.85}
        onPress={() => setActiveId("all")}
      >
        <CategoryTabCircle active={activeId === "all"} fallbackIcon="apps-outline" layout={layout} />
        <Text
          style={[styles.tabText, { width: itemW }, activeId === "all" && styles.tabTextActive]}
          numberOfLines={2}
        >
          All
        </Text>
        {activeId === "all" ? <View style={styles.tabUnderline} /> : <View style={styles.tabUnderlineSpacer} />}
      </TouchableOpacity>

      {items.map((cat) => {
        const active = activeId === cat.id;
        return (
          <TouchableOpacity
            key={cat.id}
            style={[styles.tab, { width: itemW, minHeight: tabMinHeight }]}
            activeOpacity={0.85}
            onPress={() => {
              setActiveId(cat.id);
              onSelect(cat.id, cat.slug);
            }}
          >
            <CategoryTabCircle
              active={active}
              imageUrl={cat.imageUrl}
              cacheKey={`tab-category-${cat.id}`}
              layout={layout}
            />
            <Text
              style={[styles.tabText, { width: itemW }, active && styles.tabTextActive]}
              numberOfLines={2}
            >
              {cat.name}
            </Text>
            {active ? <View style={styles.tabUnderline} /> : <View style={styles.tabUnderlineSpacer} />}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** Mirrors `categoryRailCircle` in home/index classic layout. */
const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    alignItems: "flex-start",
    paddingTop: 2,
    paddingBottom: 4,
  },
  tab: {
    alignItems: "center",
  },
  tabThumb: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
    borderWidth: 2,
    borderColor: "transparent",
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 1, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    }),
    elevation: 3,
  },
  tabThumbActive: {
    borderColor: GatiMitraColors.primaryMint,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
  },
  tabTextActive: {
    fontWeight: "700",
  },
  tabUnderline: {
    marginTop: 4,
    height: 3,
    width: 28,
    borderRadius: 2,
    backgroundColor: "#E11D48",
  },
  tabUnderlineSpacer: {
    marginTop: 4,
    height: 3,
    width: 28,
  },
});
