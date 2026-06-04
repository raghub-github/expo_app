/**
 * GatiMitra Ride Booking – All Services grid.
 */

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useLocationStore } from "@/store/locationStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";
import { AllServicesGrid } from "./AllServicesGrid";
import { ActiveRideBottomSheet } from "@/components/ride/ActiveRideBottomSheet";
import { useActivePersonRideOrders } from "@/hooks/useActivePersonRideOrders";

const PAD = 18;

export function RideBookingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { address } = useLocationStore();

  const locationDisplay = address?.fullAddress ?? address?.primary ?? "Select location";
  const { activeRides } = useActivePersonRideOrders(true);
  const hasActiveRide = activeRides.length > 0;

  const goToPickup = () => router.push("/home/service/ride-pickup");
  const goToLocation = () => router.push("/location");

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
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
          { paddingBottom: insets.bottom + (hasActiveRide ? 120 : 80) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <AllServicesGrid onSelectService={goToPickup} />
      </ScrollView>

      <ActiveRideBottomSheet rides={activeRides} bottomInset={insets.bottom + 16} />
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingTop: 14,
  },
});
