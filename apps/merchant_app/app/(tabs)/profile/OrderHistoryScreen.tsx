import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { OrdersListScreen } from "../orders";

export default function OrderHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedStore } = useSelectedStore();
  const topPad = Math.max(insets.top, SAFE_AREA_TOP_MIN);
  const storeName = selectedStore?.store_name ?? "Your store";

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: topPad + 6 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          hitSlop={8}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.screenTitle}>Order history</Text>
          <Text style={styles.storeName} numberOfLines={1}>
            {storeName}
          </Text>
        </View>
        <View style={styles.headerRightSpacer} />
      </View>
      <View style={styles.listWrap}>
        <OrdersListScreen mode="history" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
      default: {},
    }),
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  headerRightSpacer: {
    width: 36,
  },
  screenTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.2,
  },
  storeName: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
    textAlign: "center",
  },
  listWrap: {
    flex: 1,
  },
});
