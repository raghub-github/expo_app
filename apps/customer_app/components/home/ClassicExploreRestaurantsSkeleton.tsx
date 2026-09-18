/**
 * Classic food home — explore restaurants loading (store header + item rail).
 * Not the grid/poster GMRestaurantCardV2 skeleton.
 */

import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { GMSkeleton } from "@/components/ShimmerSkeleton";

const PAD = 16;
const ITEM_W = 132;
const ITEM_IMG = 124;

type Props = {
  count?: number;
};

export function ClassicExploreRestaurantsSkeleton({ count = 2 }: Props) {
  const { width: winW } = useWindowDimensions();
  const cardW = Math.max(280, winW - PAD * 2);

  return (
    <View style={styles.wrap}>
      {Array.from({ length: count }).map((_, cardIdx) => (
        <View key={cardIdx} style={[styles.card, { width: cardW }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <GMSkeleton style={styles.titleLine} />
              <GMSkeleton style={styles.metaLine} />
              <GMSkeleton style={styles.metaLineShort} />
            </View>
            <GMSkeleton style={styles.stamp} />
          </View>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            scrollEnabled={false}
            contentContainerStyle={styles.itemsRow}
          >
            {Array.from({ length: 3 }).map((__, i) => (
              <View key={i} style={styles.itemCard}>
                <GMSkeleton style={styles.itemImage} />
                <GMSkeleton style={styles.itemNameLine} />
                <GMSkeleton style={styles.itemPriceLine} />
              </View>
            ))}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  card: {
    alignSelf: "center",
    marginBottom: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.06)",
    paddingTop: 14,
    paddingBottom: 12,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  headerText: {
    flex: 1,
    gap: 8,
  },
  titleLine: {
    height: 18,
    width: "72%",
    borderRadius: 8,
  },
  metaLine: {
    height: 12,
    width: "55%",
    borderRadius: 6,
  },
  metaLineShort: {
    height: 12,
    width: "68%",
    borderRadius: 6,
  },
  stamp: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  itemsRow: {
    paddingHorizontal: 14,
    gap: 12,
    paddingTop: 12,
  },
  itemCard: {
    width: ITEM_W,
  },
  itemImage: {
    width: ITEM_W,
    height: ITEM_IMG,
    borderRadius: 14,
  },
  itemNameLine: {
    marginTop: 12,
    height: 12,
    width: "88%",
    borderRadius: 6,
  },
  itemPriceLine: {
    marginTop: 8,
    height: 18,
    width: "42%",
    borderRadius: 8,
  },
});
