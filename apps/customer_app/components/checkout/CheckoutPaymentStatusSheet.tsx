/**
 * Place-order status sheet (Magicpin layout, GatiMitra light brand).
 * Progress crawls until `ready`, then fills to 100% and calls onProgressComplete
 * so payment options open only when the bar finishes — never stuck mid-way.
 */

import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { AppText } from "@/components/AppText";
import { CheckoutPaymentMethodLogo } from "@/components/checkout/CheckoutPaymentMethodLogo";
import { StoreFonts } from "@/constants/storeTypography";
import { useModalSheetBottomInset } from "@/hooks/useModalSheetBottomInset";
import { upiAppDisplayName } from "@/lib/openUpiApp";

/** Matches checkout Place Order CTA — accent only, not a full-green sheet. */
const CTA_GREEN = "#137243";
const SURFACE = "#FFFFFF";
const BODY_BG = "#F7F8F7";
const TRACK = "#E6EAE7";
const TEXT = "#111827";
const TEXT_MUTED = "#6B7280";
const ICON_TILE = "#EEF2EF";

export type CheckoutPaymentStatusPhase =
  | "preparing"
  | "opening_app"
  | "confirming";

type Props = {
  visible: boolean;
  phase: CheckoutPaymentStatusPhase;
  /**
   * Parent finished minting the gateway order. Sheet races the bar to 100%,
   * then fires onProgressComplete (open Razorpay / UPI).
   */
  ready?: boolean;
  onProgressComplete?: () => void;
  upiApp?: string | null;
  paymentLogoKey?: string | null;
  paymentMethodLabel?: string | null;
  amountInr?: number | null;
  savedAmountInr?: number | null;
  storeName?: string | null;
  deliveryType?: "delivery" | "self_pickup";
  addressLine?: string | null;
  onCancel: () => void;
};

function phaseHeadline(
  phase: CheckoutPaymentStatusPhase,
  deliveryType: "delivery" | "self_pickup",
  upiApp?: string | null
): { eyebrow: string; title: string } {
  const orderKind = deliveryType === "self_pickup" ? "takeaway order" : "delivery order";
  if (phase === "opening_app") {
    return { eyebrow: "Opening", title: upiAppDisplayName(upiApp) };
  }
  if (phase === "confirming") {
    return { eyebrow: "Confirming your", title: "payment" };
  }
  return { eyebrow: "Placing your", title: orderKind };
}

function formatInr(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function CheckoutPaymentStatusSheet({
  visible,
  phase,
  ready = false,
  onProgressComplete,
  upiApp = null,
  paymentLogoKey = null,
  paymentMethodLabel = null,
  amountInr = null,
  savedAmountInr = null,
  storeName = null,
  deliveryType = "delivery",
  addressLine = null,
  onCancel,
}: Props) {
  // Clears Android 3-button / gesture nav under translucent Modal (not just safe-area).
  const bottomInset = useModalSheetBottomInset(14);
  const { eyebrow, title } = phaseHeadline(phase, deliveryType, upiApp);
  const amountLabel =
    amountInr != null && Number.isFinite(amountInr) ? `₹${formatInr(amountInr)}` : null;
  const savedLabel =
    savedAmountInr != null && Number.isFinite(savedAmountInr) && savedAmountInr > 0.005
      ? `₹${formatInr(savedAmountInr)}`
      : null;
  const methodLabel =
    (paymentMethodLabel && paymentMethodLabel.trim()) ||
    (upiApp ? `${upiAppDisplayName(upiApp)} UPI` : "UPI, Cards & more");
  const storeLabel = (storeName && storeName.trim()) || "restaurant";
  const fulfillmentTitle =
    deliveryType === "self_pickup" ? "Pickup from " : "Delivering from ";

  const progress = useSharedValue(0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onProgressComplete);
  onCompleteRef.current = onProgressComplete;

  const fireComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current?.();
  }, []);

  // Open / close: start a long crawl that never finishes alone (avoids a stuck mid bar).
  useEffect(() => {
    if (!visible) {
      cancelAnimation(progress);
      progress.value = 0;
      completedRef.current = false;
      return;
    }
    completedRef.current = false;
    progress.value = 0.04;
    progress.value = withTiming(0.88, {
      duration: 16_000,
      easing: Easing.out(Easing.quad),
    });
  }, [visible, progress]);

  // Gateway ready → finish the bar, then open payment (Magicpin timing).
  useEffect(() => {
    if (!visible || !ready) return;
    cancelAnimation(progress);
    progress.value = withTiming(
      1,
      { duration: 480, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(fireComplete)();
      }
    );
  }, [visible, ready, progress, fireComplete]);

  // Confirming phase with no separate ready flag — fill through.
  useEffect(() => {
    if (!visible || phase !== "confirming" || ready) return;
    cancelAnimation(progress);
    progress.value = withTiming(1, {
      duration: 2200,
      easing: Easing.out(Easing.quad),
    });
  }, [visible, phase, ready, progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(4, Math.min(100, progress.value * 100))}%`,
  }));

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onCancel}
      maxHeightRatio={0.66}
      flushBottom
      backdropOpacity={0.32}
      showCloseButton
      closeOnBackdropPress={false}
      sheetStyle={styles.sheet}
    >
      <View style={[styles.root, { paddingBottom: bottomInset }]}>
        {/* Purple note sits on the sheet top curve, flush above the green header (no gap). */}
        <View style={styles.noteBanner}>
          <View style={styles.noteIconTile}>
            <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.noteTextCol}>
            <AppText style={styles.noteTitle} bold numberOfLines={2}>
              Hang tight! Keep this screen open until your payment is confirmed.
            </AppText>
          </View>
        </View>

        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            <AppText style={styles.eyebrow} bold>
              {eyebrow}
            </AppText>
            <AppText style={styles.headerTitle} bold>
              {title}
            </AppText>
          </View>
          <View style={styles.headerArt} accessibilityElementsHidden>
            <View style={styles.artTile}>
              <MaterialCommunityIcons
                name={deliveryType === "self_pickup" ? "shopping-outline" : "moped"}
                size={30}
                color={CTA_GREEN}
              />
            </View>
            <View style={styles.artBadge}>
              <Ionicons name="location" size={11} color="#FFFFFF" />
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons
                name={deliveryType === "self_pickup" ? "storefront-outline" : "bike-fast"}
                size={20}
                color={TEXT}
              />
            </View>
            <View style={styles.rowMain}>
              <AppText style={styles.rowTitle} bold>
                {fulfillmentTitle}
                <AppText style={styles.storeName} bold>
                  {storeLabel}
                </AppText>
              </AppText>
              {addressLine ? (
                <AppText style={styles.addressText} bold numberOfLines={2}>
                  {addressLine}
                </AppText>
              ) : null}
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="card-outline" size={19} color={TEXT} />
            </View>
            <View style={styles.payRowMain}>
              <AppText style={styles.payLabel} bold>
                To pay:{" "}
                <AppText style={styles.payAmount} bold>
                  {amountLabel ?? "—"}
                </AppText>
              </AppText>
              <View style={styles.methodPill}>
                <CheckoutPaymentMethodLogo
                  logoKey={paymentLogoKey || upiApp || "upi"}
                  size={16}
                />
                <AppText style={styles.methodPillText} bold numberOfLines={1}>
                  {methodLabel}
                </AppText>
              </View>
            </View>
          </View>

          {savedLabel ? (
            <View style={styles.row}>
              <View style={styles.rowIcon}>
                <Ionicons name="wallet-outline" size={18} color={TEXT} />
              </View>
              <AppText style={styles.savedText} bold>
                Saved <AppText style={styles.savedAmount} bold>{savedLabel}</AppText>
              </AppText>
            </View>
          ) : null}

          <View style={styles.footer}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, progressStyle]} />
            </View>
          </View>
        </View>
      </View>
    </StoreBottomSheetShell>
  );
}

export function CheckoutPaymentReturnOverlay({
  visible,
  onCancel,
}: {
  visible: boolean;
  onCancel?: () => void;
}) {
  return (
    <CheckoutPaymentStatusSheet
      visible={visible}
      phase="confirming"
      ready
      onCancel={onCancel ?? (() => undefined)}
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
    paddingTop: 0,
  },
  root: {
    backgroundColor: SURFACE,
  },
  /** Same top radius as the sheet/green card; no bottom radius — sits flush on green. */
  noteBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#3F3D89",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  noteIconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  noteTextCol: {
    flex: 1,
    paddingRight: 4,
  },
  noteTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: StoreFonts.loraBold,
    color: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    minHeight: 96,
    backgroundColor: CTA_GREEN,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  headerTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    color: "rgba(255,255,255,0.95)",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontFamily: StoreFonts.loraBold,
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  headerArt: {
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  artTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  artBadge: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EA580C",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: CTA_GREEN,
  },
  body: {
    backgroundColor: BODY_BG,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: ICON_TILE,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  rowMain: {
    flex: 1,
    gap: 8,
  },
  rowTitle: {
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    color: TEXT,
    lineHeight: 24,
  },
  storeName: {
    fontFamily: StoreFonts.loraBold,
    color: CTA_GREEN,
  },
  addressText: {
    fontSize: 13,
    fontFamily: StoreFonts.loraBold,
    color: TEXT_MUTED,
    lineHeight: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginLeft: 50,
  },
  payRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: 40,
  },
  payLabel: {
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    color: TEXT,
    flexShrink: 1,
  },
  payAmount: {
    fontFamily: StoreFonts.loraBold,
    color: TEXT,
  },
  methodPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F5F3FF",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    maxWidth: "52%",
  },
  methodPillText: {
    fontSize: 12,
    fontFamily: StoreFonts.loraBold,
    color: "#5B21B6",
    flexShrink: 1,
  },
  savedText: {
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    color: TEXT,
    marginTop: 6,
  },
  savedAmount: {
    fontFamily: StoreFonts.loraBold,
    color: CTA_GREEN,
  },
  footer: {
    marginTop: 8,
    paddingBottom: 8,
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: TRACK,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: CTA_GREEN,
  },
});
