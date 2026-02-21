import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const HEADER_HEIGHT = 48;
const TITLE_DARK = "#1A1A1A";

function CartHeader({ title = "Cart" }: { title?: string }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
        <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.placeholder} />
    </View>
  );
}

function PlaceOrderHeader() {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
        <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
      </TouchableOpacity>
      <Text style={styles.title}>Place order</Text>
      <View style={styles.placeholder} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: HEADER_HEIGHT,
    paddingHorizontal: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { padding: 8 },
  title: { fontSize: 18, fontWeight: "700", color: TITLE_DARK },
  placeholder: { width: 40 },
});

export default function CheckoutLayout() {
  return (
    <Stack
      screenOptions={{
        headerStatusBarHeight: 0,
      }}
    >
      <Stack.Screen
        name="cart"
        options={{
          header: () => <CartHeader />,
        }}
      />
      <Stack.Screen
        name="index"
        options={{
          header: () => <PlaceOrderHeader />,
        }}
      />
      <Stack.Screen
        name="shop-cart"
        options={{
          header: () => <CartHeader title="Shop Cart" />,
        }}
      />
    </Stack>
  );
}
