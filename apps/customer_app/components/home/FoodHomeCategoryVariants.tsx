import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { UserAppCategoryImage } from "@/components/category/UserAppCategoryImage";
import { GatiMitraColors } from "@/constants/gatimitra";

export type FoodHomeCategoryItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
};

type Props = {
  items: FoodHomeCategoryItem[];
  columns?: number;
  maxItems?: number;
  onSelect: (id: string, slug: string) => void;
};

export function FoodHomeCategoryGrid({ items, columns = 4, maxItems = 8, onSelect }: Props) {
  const visible = items.slice(0, maxItems);
  const itemWidthPercent = `${100 / columns}%` as `${number}%`;

  return (
    <View style={styles.grid}>
      {visible.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          style={[styles.cell, { width: itemWidthPercent }]}
          activeOpacity={0.9}
          onPress={() => onSelect(cat.id, cat.slug)}
        >
          <View style={styles.circle}>
            <UserAppCategoryImage
              imageUrl={cat.imageUrl}
              cacheKey={`grid-category-${cat.id}`}
              style={styles.image}
            />
          </View>
          <Text style={styles.label} numberOfLines={2}>
            {cat.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

type ChipsProps = {
  items: FoodHomeCategoryItem[];
  onSelect: (id: string, slug: string) => void;
};

export function FoodHomeCategoryChips({ items, onSelect }: ChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipsContent}
    >
      {items.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          style={styles.chip}
          activeOpacity={0.85}
          onPress={() => onSelect(cat.id, cat.slug)}
        >
          <Text style={styles.chipText} numberOfLines={1}>
            {cat.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    rowGap: 12,
  },
  cell: {
    alignItems: "center",
    paddingHorizontal: 4,
  },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: GatiMitraColors.cardSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  image: {
    width: 44,
    height: 44,
  },
  label: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
    minHeight: 28,
  },
  chipsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GatiMitraColors.cardSurface,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
    maxWidth: 120,
  },
});
