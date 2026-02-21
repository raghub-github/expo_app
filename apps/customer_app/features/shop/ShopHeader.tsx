/**
 * Shop header – matches Food header layout: back, title + chevron, address line (no icon), cart.
 * Long addresses truncate with ellipsis to avoid overlap.
 */

import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP, HEADER_VERTICAL_PADDING } from "@/constants/layout";
import { useLocationStore } from "@/store/locationStore";

const PAD = 16;
const TITLE_DARK = GatiMitraColors.textPrimary;
const TEXT_GRAY = GatiMitraColors.textSecondary;

type ShopHeaderProps = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchFocus?: () => void;
  cartCount: number;
  onCartPress?: () => void;
};

function getLocationDisplay(fullAddress: string | undefined, primary: string | undefined, secondary: string | undefined): string {
  if (fullAddress?.trim()) return fullAddress.trim();
  if (!primary) return "Select location";
  if (secondary?.trim()) return `${primary}, ${secondary}`;
  return primary;
}

export function ShopHeader({
  searchQuery,
  onSearchChange,
  onSearchFocus,
  cartCount,
  onCartPress,
}: ShopHeaderProps) {
  const router = useRouter();
  const { address } = useLocationStore();
  const locationDisplay = getLocationDisplay(address?.fullAddress, address?.primary, address?.secondary);

  return (
    <View style={styles.wrap}>
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP, paddingBottom: HEADER_VERTICAL_PADDING }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerCenter}
          activeOpacity={0.8}
          onPress={() => router.push("/location")}
        >
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Shop / Marketplace
            </Text>
            <Ionicons name="chevron-down" size={16} color={TEXT_GRAY} />
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
            style={styles.cartBtn}
            onPress={onCartPress}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={24} color={TITLE_DARK} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount > 99 ? "99+" : cartCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
      <View style={[styles.searchBar, GatiMitraColors.searchShadow]}>
        <Ionicons name="search" size={20} color={TEXT_GRAY} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products, categories…"
          placeholderTextColor={TEXT_GRAY}
          value={searchQuery}
          onChangeText={onSearchChange}
          onFocus={onSearchFocus}
          returnKeyType="search"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: GatiMitraColors.background,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.background,
    paddingHorizontal: PAD,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    ...GatiMitraColors.searchShadow,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerCenter: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: TITLE_DARK },
  locationRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  locationText: {
    fontSize: 13,
    color: TEXT_GRAY,
    flex: 1,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  cartBtn: { padding: 6, position: "relative" },
  cartBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: PAD,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: GatiMitraColors.textPrimary,
    paddingVertical: 0,
  },
});
