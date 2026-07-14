import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import type { FoodItemUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";
import { GMSkeleton } from "@/components/ShimmerSkeleton";

type Props = {
  title: string;
  items: FoodItemUnderPrice[];
  loading?: boolean;
  onPressItem: (item: FoodItemUnderPrice) => void;
};

const CARD_W = 132;

export function FoodHomeUnder250Section({ title, items, loading, onPressItem }: Props) {
  if (!loading && items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{title}</Text>
      {loading ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled delaysContentTouches={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
          {Array.from({ length: 4 }).map((_, i) => (
            <GMSkeleton key={i} style={styles.skeletonCard} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled delaysContentTouches={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.row}>
          {items.map((item) => {
            const uri = toAbsoluteImageUrl(item.imageUrl);
            return (
              <TouchableOpacity
                key={`${item.storePublicId}-${item.itemId}`}
                style={styles.card}
                activeOpacity={0.9}
                onPress={() => onPressItem(item)}
              >
                <View style={styles.imageWrap}>
                  {uri ? (
                    <Image source={{ uri }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
                  ) : (
                    <View style={[styles.image, styles.imageFallback]}>
                      <Ionicons name="restaurant-outline" size={22} color="#94A3B8" />
                    </View>
                  )}
                  <View style={styles.priceBadge}>
                    <Text style={styles.priceText}>₹{Math.round(item.price)}</Text>
                  </View>
                </View>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.store} numberOfLines={1}>
                  {item.storeName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  heading: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    paddingHorizontal: 16,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  row: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    width: CARD_W,
  },
  skeletonCard: {
    width: CARD_W,
    height: 156,
    borderRadius: 12,
  },
  imageWrap: {
    width: CARD_W,
    height: CARD_W,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    marginBottom: 6,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  priceBadge: {
    position: "absolute",
    left: 6,
    bottom: 6,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  priceText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  name: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    lineHeight: 16,
  },
  store: {
    marginTop: 2,
    fontSize: 10,
    color: "#64748B",
  },
});
