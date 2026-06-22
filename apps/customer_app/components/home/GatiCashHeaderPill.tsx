import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { GatiMitraColors } from "@/constants/gatimitra";
import { walletService } from "@/services/wallet.service";
import { useAuthStore } from "@/store/authStore";

const TITLE_DARK = "#1F2937";
const ICON_CIRCLE_BG = "#F3F4F6";

function formatPillBalance(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 100000) {
    const lakhs = value / 100000;
    return `${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`;
  }
  if (value >= 10000) {
    const thousands = value / 1000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }
  return value % 1 === 0 ? String(Math.round(value)) : value.toFixed(0);
}

/** Compact wallet chip — circle on icon only, amount below (Zomato-style). */
export function GatiCashHeaderPill() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  const balanceQ = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => walletService.getBalance(),
    enabled: hydrated && !!session,
    staleTime: 60_000,
    retry: false,
  });

  const balance = balanceQ.data?.available_balance ?? balanceQ.data?.balance ?? 0;
  const displayAmount = formatPillBalance(balance);
  const loading = balanceQ.isLoading && !!session;

  return (
    <TouchableOpacity
      style={styles.pill}
      activeOpacity={0.82}
      onPress={() => router.push("/wallet")}
      accessibilityRole="button"
      accessibilityLabel={`GatiCash wallet, balance ${displayAmount} rupees`}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="wallet-outline" size={13} color={TITLE_DARK} />
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={GatiMitraColors.splashMint} style={styles.loader} />
      ) : (
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          ₹{displayAmount}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 36,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 3,
    paddingBottom: 2,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  iconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ICON_CIRCLE_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  amount: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "800",
    color: TITLE_DARK,
    letterSpacing: -0.1,
    lineHeight: 10,
    maxWidth: 32,
    textAlign: "center",
  },
  loader: {
    marginTop: 0,
    transform: [{ scale: 0.4 }],
  },
});
