/**
 * GatiMitra Shop / Marketplace – mobile-first e-commerce.
 * Sticky header, category slider, promo carousel, 2-col product grid,
 * live search, category & sort via bottom sheet, Add to Cart with quantity.
 */

import { useState, useEffect, useMemo } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useShopCartStore } from "@/store/shopCartStore";
import {
  SHOP_CATEGORIES,
  SHOP_PRODUCTS,
  getShopProductImage,
  type ProductCategoryId,
  type ShopProduct,
} from "./data";
import { useRouter } from "expo-router";
import { ShopHeader } from "./ShopHeader";
import { CategorySlider } from "./CategorySlider";
import { ShopPromoBanner } from "./ShopPromoBanner";
import { ProductCard } from "./ProductCard";
import {
  FilterBottomSheet,
  type SortOption,
} from "./FilterBottomSheet";

const { width } = Dimensions.get("window");
const PAD = 16;
const GAP = 10;

function filterAndSortProducts(
  products: ShopProduct[],
  searchQuery: string,
  categoryId: ProductCategoryId,
  sortOption: SortOption
): ShopProduct[] {
  let list = products;

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        SHOP_CATEGORIES.find((c) => c.id === p.categoryId)?.name.toLowerCase().includes(q)
    );
  }

  if (categoryId !== "all") {
    list = list.filter((p) => p.categoryId === categoryId);
  }

  switch (sortOption) {
    case "price_asc":
      list = [...list].sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      list = [...list].sort((a, b) => b.price - a.price);
      break;
    case "popular":
      list = [...list].filter((p) => p.popular).concat([...list].filter((p) => !p.popular));
      break;
    default:
      break;
  }

  return list;
}

export function ShopScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ProductCategoryId>("all");
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const hydrate = useShopCartStore((s) => s.hydrate);
  const items = useShopCartStore((s) => s.items);
  const cartCount = items.reduce((n, i) => n + i.quantity, 0);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const filteredProducts = useMemo(
    () => filterAndSortProducts(SHOP_PRODUCTS, searchQuery, activeCategory, sortOption),
    [searchQuery, activeCategory, sortOption]
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ShopHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchFocus={() => setFilterSheetVisible(true)}
        cartCount={cartCount}
        onCartPress={() => router.push("/checkout/shop-cart")}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <CategorySlider
          categories={SHOP_CATEGORIES}
          activeId={activeCategory}
          onSelect={setActiveCategory}
        />
        <ShopPromoBanner />
        <View style={styles.filterRow}>
          <AppText style={styles.sectionTitle}>
            {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
          </AppText>
          <TouchableOpacity
            style={styles.filterBtn}
            onPress={() => setFilterSheetVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="options-outline" size={20} color={GatiMitraColors.textPrimary} />
            <AppText style={styles.filterBtnText}>Filter & Sort</AppText>
          </TouchableOpacity>
        </View>
        <View style={styles.grid}>
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              imageKey={product.imageKey}
            />
          ))}
        </View>
        {filteredProducts.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={GatiMitraColors.border} />
            <AppText style={styles.emptyText}>No products match your filters</AppText>
          </View>
        )}
      </ScrollView>

      <FilterBottomSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        selectedCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        sortOption={sortOption}
        onSortChange={setSortOption}
        categories={SHOP_CATEGORIES}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraColors.background },
  scroll: { flex: 1 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  filterBtnText: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.textPrimary },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    gap: GAP,
  },
  empty: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    marginTop: 10,
  },
});
