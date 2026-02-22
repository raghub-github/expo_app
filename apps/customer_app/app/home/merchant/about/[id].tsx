/**
 * Restaurant About page – full_address, operational status, cuisine, etc. from merchant_stores.
 */

import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { merchantService } from "@/services/merchant.service";
import { GatiMitraColors } from "@/constants/gatimitra";

const CARD_RADIUS = 16;
const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

export default function MerchantAboutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const storeId = id ?? "";

  const { data: about, isLoading, error } = useQuery({
    queryKey: ["merchant-about", storeId],
    queryFn: () => merchantService.getMerchantAbout(storeId),
    enabled: !!storeId,
  });

  if (!storeId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Invalid restaurant</Text>
      </View>
    );
  }

  if (isLoading || !about) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={GatiMitraColors.mintStart} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Could not load restaurant info</Text>
      </View>
    );
  }

  const displayName = about.store_display_name ?? about.store_name;
  const cuisines = Array.isArray(about.cuisine_types) ? about.cuisine_types.join(", ") : "";
  const isOpen = (about.operational_status ?? "").toLowerCase() === "open";
  const prepMins = about.avg_preparation_time_minutes != null && about.avg_preparation_time_minutes > 0
    ? `${about.avg_preparation_time_minutes} mins`
    : null;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, SHADOW]}>
          <Text style={styles.storeName}>{displayName}</Text>
          {cuisines ? <Text style={styles.cuisine}>{cuisines}</Text> : null}
          {about.full_address ? (
            <Text style={styles.address}>{about.full_address}</Text>
          ) : null}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => {}}>
              <Ionicons name="call-outline" size={22} color={GatiMitraColors.mintStart} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} onPress={() => {}}>
              <Ionicons name="navigate-outline" size={22} color={GatiMitraColors.mintStart} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, SHADOW]}>
          <View style={styles.statusRow}>
            <Ionicons
              name={isOpen ? "checkmark-circle" : "close-circle"}
              size={20}
              color={isOpen ? GatiMitraColors.mintStart : GatiMitraColors.textSecondary}
            />
            <Text style={styles.statusText}>{isOpen ? "Open now" : about.operational_status ?? "Closed"}</Text>
          </View>
          {prepMins ? (
            <View style={styles.statusRow}>
              <Ionicons name="time-outline" size={20} color={GatiMitraColors.textSecondary} />
              <Text style={styles.statusSub}>Prep time: {prepMins}</Text>
            </View>
          ) : null}
          <View style={styles.statusRow}>
            <Ionicons name="bicycle-outline" size={20} color={GatiMitraColors.textSecondary} />
            <Text style={styles.statusSub}>Delivery-only kitchen</Text>
          </View>
        </View>

        <View style={[styles.card, SHADOW]}>
          <Text style={styles.legalTitle}>Legal information</Text>
          <Text style={styles.legalSub}>Restaurant details and FSSAI info (future)</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.back()}
          style={styles.backBtnWrap}
        >
          <LinearGradient
            colors={GatiMitraColors.mintGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.backBtn}
          >
            <Text style={styles.backBtnText}>Go back to menu</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraColors.surfaceWarm },
  center: { justifyContent: "center", alignItems: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8 },
  errorText: { fontSize: 16, color: GatiMitraColors.textSecondary },
  card: {
    backgroundColor: GatiMitraColors.cardBgWarm,
    borderRadius: CARD_RADIUS,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  storeName: { fontSize: 20, fontWeight: "800", color: GatiMitraColors.textPrimary, marginBottom: 6 },
  cuisine: { fontSize: 14, color: GatiMitraColors.textSecondary, marginBottom: 10 },
  address: { fontSize: 14, color: GatiMitraColors.textPrimary, lineHeight: 20, marginBottom: 14 },
  actionRow: { flexDirection: "row", gap: 12 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: GatiMitraColors.mintStart,
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  statusText: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary },
  statusSub: { fontSize: 14, color: GatiMitraColors.textSecondary },
  legalTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraColors.textPrimary },
  legalSub: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 4 },
  footer: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: GatiMitraColors.background },
  backBtnWrap: { borderRadius: 16, overflow: "hidden" },
  backBtn: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  backBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
