import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useAuthStore } from "@/store/authStore";
import { useWalletBalance } from "@/hooks/useWalletBalance";

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

type Props = {
  variant?: "default" | "gridFirst";
};

/** Compact wallet chip — default: icon above amount; gridFirst: horizontal mint pill. */
export function GatiCashHeaderPill({ variant = "default" }: Props) {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  const balanceQ = useWalletBalance();

  const balance = balanceQ.data?.available_balance ?? balanceQ.data?.balance ?? 0;
  const displayAmount = formatPillBalance(balance);
  const loading = hydrated && !!session && balanceQ.isPending && balanceQ.data == null;

  if (variant === "gridFirst") {
    return (
      <TouchableOpacity
        style={styles.gridPill}
        activeOpacity={0.82}
        onPress={() => router.push("/wallet")}
        accessibilityRole="button"
        accessibilityLabel={`GatiCash wallet, balance ${displayAmount} rupees`}
      >
        <View style={styles.gridIconWrap}>
          <Ionicons name="wallet" size={14} color="#FFFFFF" />
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={GatiMitraColors.primaryMint} />
        ) : (
          <Text style={styles.gridAmount} numberOfLines={1}>
            ₹{displayAmount}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

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
  gridPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 32,
    paddingLeft: 4,
    paddingRight: 9,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.18)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  gridIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.primaryMint,
    alignItems: "center",
    justifyContent: "center",
  },
  gridAmount: {
    fontSize: 12,
    fontWeight: "800",
    color: TITLE_DARK,
    letterSpacing: -0.2,
    maxWidth: 52,
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
