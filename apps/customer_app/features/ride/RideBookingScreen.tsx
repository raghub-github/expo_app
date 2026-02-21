/**
 * GatiMitra Ride Booking – modern ride-booking home.
 * Compact header, premium search bar, service cards with scale animation,
 * View All opens bottom sheet (no new page), promo carousel, popular places.
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useLocationStore } from "@/store/locationStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";
import { RideCard, type RideType } from "./RideCard";
import { PromoCarousel } from "./PromoCarousel";
import { PopularDestinations } from "./PopularDestinations";
import {
  AllServicesBottomSheet,
  type ServiceId,
} from "./AllServicesBottomSheet";

const { width } = Dimensions.get("window");
const PAD = 18;
const GAP = 12;
const CARD_WIDTH = Math.floor((width - PAD * 2 - GAP) / 2);

export function RideBookingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { address, coords } = useLocationStore();
  const [allServicesVisible, setAllServicesVisible] = useState(false);

  const locationDisplay = address?.fullAddress ?? address?.primary ?? "Select location";

  const goToPickup = () => router.push("/home/service/ride-pickup");
  const goToLocation = () => router.push("/location");

  const handleRidePress = (type: RideType) => {
    if (type === "all") {
      setAllServicesVisible(true);
      return;
    }
    goToPickup();
  };

  const handleSelectService = (_id: ServiceId) => {
    goToPickup();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {/* Header – same as Food / E-commerce: title + chevron, location below; tap opens location */}
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={0.8}
          onPress={goToLocation}
        >
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Book a Ride
            </Text>
            <Ionicons name="chevron-down" size={16} color={GatiMitraColors.textSecondary} />
          </View>
          <View style={styles.locationRow}>
            <Text
              style={styles.locationText}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {locationDisplay}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/wallet")}>
            <Ionicons name="wallet-outline" size={22} color={GatiMitraColors.textPrimary} />
            <Text style={styles.walletLabel}>Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push("/notifications")}
          >
            <Ionicons name="notifications-outline" size={22} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 80 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Search pickup – premium bar with soft shadow */}
        <TouchableOpacity
          style={styles.searchBar}
          activeOpacity={0.85}
          onPress={goToPickup}
        >
          <View style={styles.searchIconWrap}>
            <Ionicons name="search" size={20} color={GatiMitraColors.emerald} />
          </View>
          <Text style={styles.searchPlaceholder}>Enter pickup location</Text>
          <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
        </TouchableOpacity>

        {/* Ride with GatiMitra – 2x2 grid */}
        <Text style={styles.sectionTitle}>Ride with GatiMitra</Text>
        <View style={styles.rideGrid}>
          <RideCard type="bike" onPress={() => handleRidePress("bike")} cardWidth={CARD_WIDTH} />
          <RideCard type="auto" onPress={() => handleRidePress("auto")} cardWidth={CARD_WIDTH} />
          <RideCard type="cab" onPress={() => handleRidePress("cab")} cardWidth={CARD_WIDTH} />
          <RideCard type="all" onPress={() => handleRidePress("all")} cardWidth={CARD_WIDTH} />
        </View>

        <PromoCarousel onBookNow={goToPickup} />

        <PopularDestinations coords={coords} onDestinationPress={() => {}} />
      </ScrollView>

      <AllServicesBottomSheet
        visible={allServicesVisible}
        onClose={() => setAllServicesVisible(false)}
        onSelectService={handleSelectService}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    paddingHorizontal: PAD,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    ...GatiMitraColors.searchShadow,
  },
  backBtn: {
    padding: 6,
    marginRight: 4,
  },
  headerCenter: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: GatiMitraColors.textPrimary },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  locationText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  walletLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    ...GatiMitraColors.searchShadow,
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginBottom: 12,
  },
  rideGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    marginBottom: 18,
  },
});
