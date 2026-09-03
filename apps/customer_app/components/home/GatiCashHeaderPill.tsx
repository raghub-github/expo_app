import { TouchableOpacity, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useWalletBalance } from "@/hooks/useWalletBalance";
import { walletBalanceFallback } from "@/lib/walletBalanceCache";
import { AppText } from "@/components/AppText";
import { markWalletEntrySource } from "@/store/walletChromeStore";

const TITLE_DARK = "#1F2937";

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
  /** When true, wallet matches Food Home (dark in discovery). Tabs Home stays light. */
  fromFoodHome?: boolean;
};

/** Compact wallet chip — always shows cached/zero balance; never blocks header on fetch. */
export function GatiCashHeaderPill({ variant = "default", fromFoodHome = false }: Props) {
  const router = useRouter();
  const balanceQ = useWalletBalance();

  const balance =
    balanceQ.data?.available_balance ??
    balanceQ.data?.balance ??
    walletBalanceFallback().available_balance;
  const displayAmount = formatPillBalance(balance);

  const openWallet = () => {
    markWalletEntrySource(fromFoodHome ? "food-home" : "default");
    router.push("/wallet");
  };

  if (variant === "gridFirst") {
    return (
      <TouchableOpacity
        style={styles.gridPill}
        activeOpacity={0.82}
        onPress={openWallet}
        accessibilityRole="button"
        accessibilityLabel={`GatiCash wallet, balance ${displayAmount} rupees`}
      >
        <View style={styles.gridIconWrap}>
          <Ionicons name="wallet" size={14} color="#FFFFFF" />
        </View>
        <AppText style={styles.gridAmount} numberOfLines={1}>
          ₹{displayAmount}
        </AppText>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.pill}
      activeOpacity={0.82}
      onPress={openWallet}
      accessibilityRole="button"
      accessibilityLabel={`GatiCash wallet, balance ${displayAmount} rupees`}
    >
      <Ionicons name="wallet-outline" size={15} color={TITLE_DARK} />
      <AppText style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        ₹{displayAmount}
      </AppText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
    paddingBottom: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.12)",
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
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
  amount: {
    marginTop: 1,
    fontSize: 8,
    fontWeight: "800",
    color: TITLE_DARK,
    letterSpacing: -0.1,
    lineHeight: 10,
    maxWidth: 34,
    textAlign: "center",
  },
});
