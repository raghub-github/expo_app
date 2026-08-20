import { ScrollView, View, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import { AppText } from "@/components/AppText";
import type { FoodHomeCategoryItem } from "@/components/home/FoodHomeCategoryVariants";
import { DiscoveryColors, DISCOVERY_PAGE_PAD } from "./discoveryTheme";

const COLS = 5;
const GAP = 8;
const ROW_GAP = 10;

function chunkIntoPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push(arr.slice(i, i + 2));
  }
  return out;
}

type Props = {
  items: FoodHomeCategoryItem[];
  onSelect: (id: string, slug: string) => void;
};

/** Exactly 2 rows, horizontally scrollable — 5 columns visible per page. */
export function DiscoveryCategoryGrid({ items, onSelect }: Props) {
  const { width } = useWindowDimensions();
  const inner = width - DISCOVERY_PAGE_PAD * 2;
  const itemW = Math.floor((inner - GAP * (COLS - 1)) / COLS);
  const circle = Math.min(58, Math.max(46, itemW - 6));
  const columns = chunkIntoPairs(items);

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      contentContainerStyle={styles.row}
    >
      <View style={styles.edgePad} />
      {columns.map((pair) => (
        <View key={`${pair[0]?.id ?? "x"}-${pair[1]?.id ?? ""}`} style={[styles.column, { gap: ROW_GAP }]}>
          {pair.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.cell, { width: itemW }]}
              activeOpacity={0.88}
              onPress={() => onSelect(cat.id, cat.slug)}
            >
              <View style={[styles.imageFrame, { width: circle, height: circle, borderRadius: circle / 2 }]}>
                <UserAppCategoryImage
                  imageUrl={cat.imageUrl}
                  cacheKey={`discovery-cat-${cat.id}`}
                  contentFit="cover"
                  fallbackColor="transparent"
                  style={{ width: circle, height: circle, borderRadius: circle / 2 }}
                />
              </View>
              <AppText style={styles.label} numberOfLines={2}>
                {cat.name}
              </AppText>
            </TouchableOpacity>
          ))}
        </View>
      ))}
      <View style={styles.edgePad} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: GAP,
    paddingVertical: 4,
    alignItems: "flex-start",
  },
  edgePad: {
    width: DISCOVERY_PAGE_PAD,
  },
  column: {
    alignItems: "center",
  },
  cell: {
    alignItems: "center",
    gap: 6,
    minHeight: 88,
  },
  imageFrame: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: DiscoveryColors.text,
    textAlign: "center",
    lineHeight: 15,
    minHeight: 30,
    alignSelf: "stretch",
    width: "100%",
  },
});
