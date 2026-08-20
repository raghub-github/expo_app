import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { AppText } from "@/components/AppText";

import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { checkoutRouterBack } from "@/lib/safeRouterBack";
import { useCartStore } from "@/store/cartStore";
import { useDiscoveryLayout } from "@/hooks/useDiscoveryLayout";
import { DiscoveryColors } from "@/features/discovery-home/discoveryTheme";

const HEADER_HEIGHT = 48;
const TITLE_DARK = "#1A1A1A";

function CartHeader({ title = "Cart" }: { title?: string }) {
  const router = useRouter();
  const merchantId = useCartStore((s) => s.merchantId);
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === "ios" ? insets.top : Math.max(insets.top, 8);
  return (
    <View style={[styles.headerWrap, { paddingTop }]}>
      <LinearGradient
        colors={["rgba(0,0,0,0.08)", "rgba(0,0,0,0.02)", "transparent"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => checkoutRouterBack(router, merchantId)}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
        <AppText style={styles.title}>{title}</AppText>
        <View style={styles.placeholder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: HEADER_HEIGHT,
    paddingHorizontal: 8,
  },
  backBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: "700", color: TITLE_DARK },
  placeholder: { width: 40 },
});

export default function CheckoutLayout() {
  const discovery = useDiscoveryLayout();
  const barStyle = discovery ? "light" : "dark";
  const barBg = discovery ? DiscoveryColors.bg : "#F8F8F8";

  return (
    <>
      <AndroidBackHandler />
      <Stack
        screenOptions={{
          freezeOnBlur: true,
          statusBarHidden: false,
          statusBarStyle: barStyle,
          contentStyle: { backgroundColor: barBg },
        }}
      >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="shop-cart"
        options={{
          header: () => <CartHeader title="Shop Cart" />,
        }}
      />
      <Stack.Screen
        name="ride-fare"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="ride-fare-success"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="success"
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
    </Stack>
    </>
  );
}
