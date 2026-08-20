/**
 * Swiggy-style bottom sheet when a coupon/offer unlocks after adding items.
 */

import { View, Modal, Pressable, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { CouponAvailablePrompt } from "@/hooks/useCouponAvailablePrompt";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

const SUNBURST_RAYS = 14;
const BRAND = GatiMitraColors.emerald;

function SunburstRays() {
  return (
    <View style={styles.sunburstWrap} pointerEvents="none">
      {Array.from({ length: SUNBURST_RAYS }, (_, i) => (
        <View
          key={i}
          style={[
            styles.sunburstRay,
            { transform: [{ rotate: `${(360 / SUNBURST_RAYS) * i}deg` }] },
          ]}
        />
      ))}
    </View>
  );
}

function ScallopedBadge() {
  return (
    <View style={styles.badgeOuter}>
      {Array.from({ length: 12 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.badgeScallop,
            { transform: [{ rotate: `${i * 30}deg` }, { translateY: -34 }] },
          ]}
        />
      ))}
      <View style={styles.badgeCore}>
        <CheckoutText style={styles.badgePct}>%</CheckoutText>
      </View>
    </View>
  );
}

export type CouponAvailableBottomSheetProps = {
  visible: boolean;
  prompt: CouponAvailablePrompt | null;
  bottomInset: number;
  onClose: () => void;
  onApply: (prompt: CouponAvailablePrompt) => void;
};

export function CouponAvailableBottomSheet({
  visible,
  prompt,
  bottomInset,
  onClose,
  onApply,
}: CouponAvailableBottomSheetProps) {
  const dark = useMerchantUiDark();
  if (!prompt) return null;

  const savingsLabel =
    prompt.savingsInr != null && prompt.savingsInr > 0 ? prompt.savingsInr : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

        <View style={styles.anchor}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            activeOpacity={0.9}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close coupon offer"
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={[styles.sheet, dark && styles.sheetDark]}>
            <LinearGradient
              colors={dark ? ["#134E4A", "#1A2A2E", MerchantDarkPalette.card] : ["#D6F5E8", "#EEFBF3", "#FFFFFF"]}
              style={styles.sheetGradient}
            >
              <Animated.View
                entering={FadeInDown.duration(280)}
                style={[styles.content, { paddingBottom: Math.max(bottomInset, 16) }]}
              >
                <SunburstRays />
                <ScallopedBadge />

                <CheckoutText style={[styles.exclusive, dark && styles.textDark]}>✦ EXCLUSIVELY FOR YOU ✦</CheckoutText>

                <CheckoutText style={[styles.headline, dark && styles.textDark]}>
                  {savingsLabel != null ? (
                    <>
                      Save <CheckoutText style={styles.headlineAccent}>₹{savingsLabel}</CheckoutText> on this order
                    </>
                  ) : (
                    <>
                      <CheckoutText style={styles.headlineAccent}>{prompt.offerTitle}</CheckoutText> unlocked for you
                    </>
                  )}
                </CheckoutText>

                <CheckoutText style={[styles.couponLine, dark && styles.mutedDark]}>{prompt.promoLine}</CheckoutText>

                {prompt.description ? (
                  <CheckoutText style={[styles.summaryLine, dark && styles.mutedDark]} numberOfLines={2}>
                    {prompt.description}
                  </CheckoutText>
                ) : null}

                <CheckoutText style={[styles.hint, dark && styles.mutedDark]}>Tap on &apos;APPLY&apos; to avail this</CheckoutText>

                <TouchableOpacity
                  style={styles.applyBtnWrap}
                  activeOpacity={0.88}
                  onPress={() => onApply(prompt)}
                >
                  <LinearGradient
                    colors={[...GatiMitraColors.checkoutGradient]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.applyBtn}
                  >
                    <CheckoutText style={styles.applyBtnText}>APPLY</CheckoutText>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </LinearGradient>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.52)",
  },
  anchor: {
    width: "100%",
    alignItems: "center",
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(55, 65, 81, 0.95)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...(Platform.OS === "android"
      ? { elevation: 8 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        }),
  },
  sheet: {
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
  sheetGradient: {
    paddingTop: 28,
    paddingHorizontal: 24,
  },
  content: {
    alignItems: "center",
    paddingTop: 0,
  },
  sunburstWrap: {
    position: "absolute",
    top: 8,
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  sunburstRay: {
    position: "absolute",
    width: 2,
    height: 72,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 1,
    top: 8,
  },
  badgeOuter: {
    width: 88,
    height: 88,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    zIndex: 2,
  },
  badgeScallop: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: BRAND,
  },
  badgeCore: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  badgePct: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "800",
  },
  exclusive: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: "#111827",
    marginBottom: 10,
  },
  headline: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    lineHeight: 32,
    marginBottom: 8,
  },
  headlineAccent: {
    color: BRAND,
  },
  couponLine: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
    marginBottom: 6,
  },
  summaryLine: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraColors.emeraldLight,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  hint: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 18,
  },
  applyBtnWrap: {
    alignSelf: "stretch",
  },
  applyBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  sheetDark: { backgroundColor: MerchantDarkPalette.card },
  textDark: { color: MerchantDarkPalette.text },
  mutedDark: { color: MerchantDarkPalette.textMuted },
});
