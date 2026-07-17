/**
 * Popular Restaurants Near You — horizontal list section.
 */

import { View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { MerchantSummary } from "@/services/merchant.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HomePopularRestaurantCard } from "./HomePopularRestaurantCard";

const PAD = 16;

type Props = {
  merchants: MerchantSummary[];
  loading?: boolean;
  weatherDelayMinutes?: number;
};

export function HomePopularRestaurants({
  merchants,
  loading = false,
  weatherDelayMinutes = 0,
}: Props) {
  const router = useRouter();

  if (!loading && merchants.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <AppText style={styles.title}>Popular Restaurants Near You</AppText>
        <TouchableOpacity
          style={styles.seeAllBtn}
          activeOpacity={0.8}
          onPress={() => router.push("/home" as never)}
        >
          <AppText style={styles.seeAllText}>See all</AppText>
          <Ionicons name="chevron-forward" size={14} color={GatiMitraColors.splashMint} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GatiMitraColors.splashMint} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {merchants.slice(0, 10).map((m) => (
            <HomePopularRestaurantCard
              key={m.id}
              merchant={m}
              weatherDelayMinutes={weatherDelayMinutes}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 18,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
    marginRight: 8,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.splashMint,
  },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingBottom: 4,
  },
  loadingWrap: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
  },
});
