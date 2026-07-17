/**
 * Offers tab — featured platform & merchant offers.
 */

import { useMemo } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { offersService } from "@/services/offers.service";
import { HomeFeaturedOfferCard } from "@/components/home/HomeFeaturedOfferCard";
import { GatiMitraColors } from "@/constants/gatimitra";
import { STATUS_BAR_TO_HEADER_GAP } from "@/constants/layout";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const CARD_W = SCREEN_W - PAD * 2;

export default function OffersTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);
  const debouncedCoords = useDebouncedCoords(coords);

  const offerLocationParams = useMemo(() => ({
    pincode: address?.pincode?.trim() || undefined,
    state: address?.state?.trim() || undefined,
    city: address?.city?.trim() || undefined,
  }), [address?.pincode, address?.state, address?.city]);

  const { data, isLoading } = useQuery({
    queryKey: [
      "featured-offers-tab",
      debouncedCoords?.latitude,
      debouncedCoords?.longitude,
      offerLocationParams.pincode,
    ],
    queryFn: () =>
      offersService.getFeaturedOffers({
        pincode: offerLocationParams.pincode,
        state: offerLocationParams.state,
        city: offerLocationParams.city,
        lat: debouncedCoords?.latitude,
        lng: debouncedCoords?.longitude,
        serviceType: "FOOD",
        limit: 12,
      }),
    enabled: debouncedCoords?.latitude != null && debouncedCoords?.longitude != null,
    staleTime: 2 * 60 * 1000,
  });

  const offers = data?.offers ?? [];

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: STATUS_BAR_TO_HEADER_GAP + 8 }]}>
        <AppText style={styles.headerTitle}>Offers</AppText>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator color={GatiMitraColors.splashMint} style={styles.loader} />
        ) : offers.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="pricetag-outline" size={40} color="#D1D5DB" />
            <AppText style={styles.emptyTitle}>No offers right now</AppText>
            <AppText style={styles.emptySub}>Check back soon for deals near you.</AppText>
          </View>
        ) : (
          offers.map((offer) => (
            <TouchableOpacity
              key={offer.id}
              activeOpacity={0.92}
              onPress={() => router.push("/home" as never)}
              style={styles.cardWrap}
            >
              <HomeFeaturedOfferCard
                title={offer.title}
                sub={offer.sub}
                storeName={offer.store_name}
                couponCode={offer.coupon_code}
                minOrderAmount={offer.min_order_amount}
                maxDiscountAmount={offer.max_discount_amount}
                offerType={offer.offer_type}
                kind={offer.kind}
                width={CARD_W}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PAD,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0F0F0",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.3,
  },
  scroll: {
    padding: PAD,
    gap: 14,
  },
  loader: {
    marginTop: 40,
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  emptySub: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  cardWrap: {
    marginBottom: 4,
  },
});
