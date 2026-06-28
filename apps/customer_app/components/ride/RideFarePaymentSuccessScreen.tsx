/**
 * Post-ride fare payment success — shown after Razorpay / GatiCash checkout completes.
 */

import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { StatusBar } from "expo-status-bar";
import { GatiMitraColors } from "@/constants/gatimitra";
import { formatRideFare } from "@/lib/ride-order-display";

const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = GatiMitraColors.deepMintStart;
const AUTO_REDIRECT_SEC = 4;

export function RideFarePaymentSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId?: string;
    formattedOrderId?: string;
    amountPaid?: string;
  }>();

  const orderId = typeof params.orderId === "string" ? params.orderId.trim() : "";
  const formattedOrderId =
    typeof params.formattedOrderId === "string" ? params.formattedOrderId.trim() : orderId;
  const amountPaid = Number(params.amountPaid ?? 0);

  const [secondsLeft, setSecondsLeft] = useState(AUTO_REDIRECT_SEC);

  useEffect(() => {
    if (!orderId) return;
    setSecondsLeft(AUTO_REDIRECT_SEC);
    const countdown = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    const redirect = setTimeout(() => {
      router.replace(`/orders/${orderId}` as const);
    }, AUTO_REDIRECT_SEC * 1000);
    return () => {
      clearInterval(countdown);
      clearTimeout(redirect);
    };
  }, [orderId, router]);

  const goToRideSummary = () => {
    if (!orderId) {
      router.replace("/(tabs)/");
      return;
    }
    router.replace(`/orders/${orderId}` as const);
  };

  const goHome = () => {
    router.replace("/(tabs)/");
  };

  if (!orderId) {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <Text style={styles.errText}>Invalid ride order</Text>
        <TouchableOpacity onPress={goHome} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)} style={styles.successHeader}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={46} color="#fff" />
          </View>
          <Text style={styles.title}>Payment completed!</Text>
          <Text style={styles.subtitle}>
            Your ride fare has been paid successfully. Your captain will receive the earnings shortly.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(300).delay(120)} style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="receipt-outline" size={18} color={GREEN} />
              </View>
              <Text style={styles.infoLabel}>Ride ID</Text>
            </View>
            <Text style={[styles.infoValue, { color: GREEN }]} numberOfLines={1}>
              #{formattedOrderId}
            </Text>
          </View>
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <View style={styles.infoLeft}>
              <View style={styles.infoIconWrap}>
                <Ionicons name="wallet-outline" size={18} color={GREEN} />
              </View>
              <Text style={styles.infoLabel}>Amount paid</Text>
            </View>
            <Text style={[styles.infoValue, styles.amountValue]}>
              {formatRideFare(amountPaid)}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(300).delay(200)} style={styles.noteCard}>
          <Ionicons name="shield-checkmark" size={20} color={GREEN_DARK} />
          <Text style={styles.noteText}>
            You can now book your next ride. Thank you for riding with GatiMitra!
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(300).delay(280)} style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={goToRideSummary} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>View ride summary</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={goHome} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Back to Home</Text>
          </TouchableOpacity>
          <Text style={styles.redirectHint}>
            Opening ride summary in {secondsLeft}s…
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  successHeader: { alignItems: "center", gap: 12, marginBottom: 8 },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    shadowColor: GREEN_DARK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    fontWeight: "500",
    maxWidth: 320,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    gap: 12,
  },
  infoRowLast: { borderBottomWidth: 0 },
  infoLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  infoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: { fontSize: 14, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  infoValue: { fontSize: 15, fontWeight: "800", color: GatiMitraColors.textPrimary },
  amountValue: { color: GREEN_DARK, fontSize: 17 },
  noteCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#ECFDF5",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    alignItems: "flex-start",
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#065F46",
    fontWeight: "600",
  },
  actions: { gap: 10, marginTop: 8 },
  primaryBtn: {
    backgroundColor: GREEN_DARK,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  secondaryBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    backgroundColor: "#fff",
  },
  secondaryBtnText: { color: GatiMitraColors.textPrimary, fontSize: 15, fontWeight: "700" },
  redirectHint: {
    textAlign: "center",
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    fontWeight: "500",
    marginTop: 4,
  },
  errText: { fontSize: 16, color: GatiMitraColors.textSecondary, marginBottom: 16 },
});
