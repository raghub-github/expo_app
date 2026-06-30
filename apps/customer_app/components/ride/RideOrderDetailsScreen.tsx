/**
 * Rapido-style completed / cancelled ride details with invoice breakdown + email.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useMutation } from "@tanstack/react-query";
import type { OrderDetail } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import { GatiMitraColors } from "@/constants/gatimitra";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { useProfile } from "@/hooks/useProfile";
import {
  RideInvoiceEmailGateSheet,
  type RideInvoiceEmailGateMode,
} from "@/components/ride/RideInvoiceEmailGateSheet";
import { rideFareBillFromBillingSnapshot } from "@/lib/ride-fare-bill-display";
import {
  buildRideSummaryInvoice,
  formatRideFare,
  formatRideHistoryDateTime,
  formatRideTripStats,
  getRideHistoryStatusLabel,
  getRideServiceLabel,
  resolveRideOrderTripDistanceKm,
  resolveRideVehicleImage,
} from "@/lib/ride-order-display";

const GREEN = GatiMitraColors.primaryMint;
const PAGE_BG = "#F3F4F6";

type Props = {
  order: OrderDetail;
  onBack: () => void;
  onOpenSupport: () => void;
};

function RouteStop({
  variant,
  address,
  isLast,
}: {
  variant: "pickup" | "drop";
  address: string;
  isLast?: boolean;
}) {
  return (
    <View style={styles.routeStopRow}>
      <View style={styles.routeRailCol}>
        <View style={[styles.routeDot, variant === "pickup" ? styles.routeDotPickup : styles.routeDotDrop]} />
        {!isLast ? <View style={styles.routeRail} /> : null}
      </View>
      <Text style={styles.routeAddress}>{address}</Text>
    </View>
  );
}

function FareTotalWithDiscount({
  totalFare,
  totalBeforeDiscount,
  size = "md",
}: {
  totalFare: number;
  totalBeforeDiscount?: number | null;
  size?: "lg" | "md";
}) {
  const hasDiscount =
    totalBeforeDiscount != null && totalBeforeDiscount > totalFare + 0.005;

  if (!hasDiscount) {
    return (
      <Text style={size === "lg" ? styles.rideFare : styles.fareHeaderAmount}>
        {formatRideFare(totalFare)}
      </Text>
    );
  }

  return (
    <View style={size === "lg" ? styles.fareTotalDiscountRowLg : styles.fareTotalDiscountRow}>
      <Text style={size === "lg" ? styles.fareTotalStruckLg : styles.fareTotalStruck}>
        {formatRideFare(totalBeforeDiscount)}
      </Text>
      <Text style={size === "lg" ? styles.fareTotalFinalLg : styles.fareTotalFinal}>
        {formatRideFare(totalFare)}
      </Text>
    </View>
  );
}

export function RideOrderDetailsScreen({ order, onBack, onOpenSupport }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: profile } = useProfile();
  const [addressExpanded, setAddressExpanded] = useState(true);
  const [fareExpanded, setFareExpanded] = useState(true);
  const [emailGateVisible, setEmailGateVisible] = useState(false);
  const [emailGateMode, setEmailGateMode] = useState<RideInvoiceEmailGateMode | null>(null);
  const [invoiceSentToast, setInvoiceSentToast] = useState<string | null>(null);
  const invoiceSentToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (invoiceSentToastTimerRef.current) clearTimeout(invoiceSentToastTimerRef.current);
    };
  }, []);

  const statusNorm = normalizeCustomerOrderStatus(order.status);
  const isCancelled = statusNorm === "CANCELLED";
  const isCompleted = statusNorm === "DELIVERED";
  const statusLabel = getRideHistoryStatusLabel(order.status);
  const rideLabel = getRideServiceLabel(order.rideType);
  const vehicleImage = resolveRideVehicleImage(order.rideType);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const pickupAddress = order.merchantAddress?.trim() || "Pickup location";
  const dropAddress = order.deliveryAddress?.trim() || "Drop location";

  const invoice = useMemo(() => {
    const summary = buildRideSummaryInvoice(order);
    return {
      lines: summary.lines,
      totalFare: summary.totalFare,
      isEstimate: summary.isEstimate,
    };
  }, [order]);

  const tipAmount = useMemo(() => {
    const snapBill = rideFareBillFromBillingSnapshot({
      billingSnapshot:
        order.billingSnapshot != null && typeof order.billingSnapshot === "object"
          ? (order.billingSnapshot as Record<string, unknown>)
          : null,
      totalAmount: order.totalAmount,
      tipAmount: order.tipAmount,
    });
    if (snapBill?.tipAmount && snapBill.tipAmount > 0.005) return snapBill.tipAmount;
    const tipLine = invoice.lines.find((line) => line.label.toLowerCase().includes("tip"));
    return tipLine?.amount ?? 0;
  }, [order, invoice.lines]);

  const invoiceTotalExclTip = useMemo(() => {
    if (tipAmount <= 0.005) return invoice.totalFare;
    return Math.max(0, Math.round((invoice.totalFare - tipAmount) * 100) / 100);
  }, [invoice.totalFare, tipAmount]);

  const discountTotal = useMemo(
    () =>
      invoice.lines
        .filter((line) => line.isDiscount)
        .reduce((sum, line) => sum + line.amount, 0),
    [invoice.lines]
  );

  const totalBeforeDiscount = useMemo(() => {
    if (discountTotal <= 0.005) return null;
    return Math.round((invoice.totalFare + discountTotal) * 100) / 100;
  }, [invoice.totalFare, discountTotal]);
  const tripStats = formatRideTripStats(
    resolveRideOrderTripDistanceKm(order),
    order.rideDurationMinutes
  );

  const sendInvoiceMutation = useMutation({
    mutationFn: () => orderService.sendRideInvoiceEmail(order.orderId),
  });

  const closeEmailGate = () => {
    setEmailGateVisible(false);
    setEmailGateMode(null);
  };

  const openEmailGate = (mode: RideInvoiceEmailGateMode) => {
    setEmailGateMode(mode);
    setEmailGateVisible(true);
  };

  const handleSendInvoice = () => {
    const email = profile?.email?.trim();
    const verified = profile?.is_email_verified ?? false;

    if (!email) {
      openEmailGate("missing_email");
      return;
    }
    if (!verified) {
      openEmailGate("unverified_email");
      return;
    }
    openEmailGate("confirm_send");
  };

  const showInvoiceSentToast = (message: string) => {
    if (invoiceSentToastTimerRef.current) clearTimeout(invoiceSentToastTimerRef.current);
    setInvoiceSentToast(message);
    invoiceSentToastTimerRef.current = setTimeout(() => {
      setInvoiceSentToast(null);
      invoiceSentToastTimerRef.current = null;
    }, 2000);
  };

  const handleConfirmSendInvoice = () => {
    void sendInvoiceMutation.mutateAsync().then(
      (res) => {
        closeEmailGate();
        showInvoiceSentToast(`Ride invoice emailed to ${res.sentTo}.`);
      },
      (err: unknown) => {
        const apiErr = err as { response?: { data?: { error?: string; message?: string } } };
        const code = apiErr?.response?.data?.error;
        const msg =
          apiErr?.response?.data?.message ??
          (err as Error)?.message ??
          "Could not send invoice. Please try again.";

        if (code === "EMAIL_NOT_VERIFIED") {
          openEmailGate("unverified_email");
          return;
        }
        if (code === "EMAIL_REQUIRED") {
          openEmailGate("missing_email");
          return;
        }
        closeEmailGate();
        Alert.alert("Could not send", msg);
      },
    );
  };

  const handleAddEmail = () => {
    closeEmailGate();
    router.push("/profile/edit");
  };

  const handleVerifyEmail = () => {
    closeEmailGate();
    router.push("/profile/verify-email");
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerSide} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Details</Text>
        <View style={styles.headerSide} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryLeft}>
              <Text style={styles.rideTypeTitle}>{rideLabel}</Text>
              <Text style={styles.rideDate}>{formatRideHistoryDateTime(order.createdAt)}</Text>
              <View style={styles.rideFareRow}>
                <FareTotalWithDiscount
                  totalFare={invoice.totalFare}
                  totalBeforeDiscount={totalBeforeDiscount}
                  size="lg"
                />
                {invoice.isEstimate ? <Text style={styles.estTag}> (.est)</Text> : null}
              </View>
            </View>
            <View style={styles.summaryRight}>
              <Image source={vehicleImage} style={styles.summaryVehicle} resizeMode="contain" />
              <View
                style={[
                  styles.statusBadge,
                  isCompleted && styles.statusBadgeCompleted,
                  isCancelled && styles.statusBadgeCancelled,
                ]}
              >
                {isCompleted ? (
                  <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                ) : null}
                <Text
                  style={[
                    styles.statusBadgeText,
                    isCompleted && styles.statusBadgeTextCompleted,
                    isCancelled && styles.statusBadgeTextCancelled,
                  ]}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setAddressExpanded((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={styles.sectionTitle}>Address details</Text>
            <Ionicons name={addressExpanded ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
          </TouchableOpacity>

          {addressExpanded ? (
            <View style={styles.sectionBody}>
              <Text style={styles.rideIdText}>Ride ID #{displayOrderId}</Text>
              <RouteStop variant="pickup" address={pickupAddress} />
              <RouteStop variant="drop" address={dropAddress} isLast />
              {tripStats ? <Text style={styles.tripStats}>{tripStats}</Text> : null}
            </View>
          ) : null}
        </View>

        <TouchableOpacity style={styles.helpBanner} onPress={onOpenSupport} activeOpacity={0.9}>
          <View style={styles.helpIconWrap}>
            <Ionicons name="headset" size={20} color="#2563EB" />
          </View>
          <View style={styles.helpTextWrap}>
            <Text style={styles.helpTitle}>Need help?</Text>
            <Text style={styles.helpSub}>We&apos;re a tap away</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#2563EB" />
        </TouchableOpacity>

        <View style={styles.card}>
          <View style={styles.invoiceHeaderRow}>
            <Ionicons name="receipt-outline" size={18} color="#111827" />
            <Text style={styles.invoiceHeaderText}>INVOICE</Text>
          </View>

          <TouchableOpacity
            style={styles.fareHeaderRow}
            onPress={() => setFareExpanded((v) => !v)}
            activeOpacity={0.85}
          >
            <Text style={styles.fareHeaderLabel}>Total Fare</Text>
            <View style={styles.fareHeaderRight}>
              <FareTotalWithDiscount
                totalFare={invoice.totalFare}
                totalBeforeDiscount={totalBeforeDiscount}
                size="md"
              />
              <Ionicons name={fareExpanded ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
            </View>
          </TouchableOpacity>

          {fareExpanded ? (
            <View style={styles.fareBreakdown}>
              {invoice.lines.map((line) => (
                <View key={`${line.label}-${line.amount}`} style={styles.fareLine}>
                  <Text style={[styles.fareLineLabel, line.isDiscount && styles.fareLineDiscountLabel]}>
                    {line.label}
                  </Text>
                  {line.isDiscount ? (
                    <Text style={styles.fareLineDiscount}>-{formatRideFare(line.amount)}</Text>
                  ) : (
                    <Text style={styles.fareLineValue}>{formatRideFare(line.amount)}</Text>
                  )}
                </View>
              ))}

              {tipAmount > 0.005 ? (
                <View style={styles.tipInvoiceNoteBlock}>
                  <Text style={styles.tipInvoiceNote}>
                    Tip amount is not included in the PDF/email invoice.
                  </Text>
                  <View style={styles.tipInvoiceMathRow}>
                    <Text style={styles.tipInvoiceMath}>
                      <Text style={styles.tipInvoiceMathValue}>{formatRideFare(invoiceTotalExclTip)}</Text>
                      <Text style={styles.tipInvoiceMathOp}> + </Text>
                      <Text style={styles.tipInvoiceMathValue}>{formatRideFare(tipAmount)} tip</Text>
                      <Text style={styles.tipInvoiceMathOp}> = </Text>
                      <Text style={styles.tipInvoiceMathTotal}>{formatRideFare(invoice.totalFare)}</Text>
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.invoiceDivider} />

          <TouchableOpacity
            style={styles.emailRow}
            onPress={handleSendInvoice}
            disabled={sendInvoiceMutation.isPending || isCancelled}
            activeOpacity={0.85}
          >
            {sendInvoiceMutation.isPending ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Ionicons name="mail-outline" size={20} color="#2563EB" />
            )}
            <Text style={styles.emailRowText}>Send invoice via Email</Text>
            <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {invoice.isEstimate ? (
          <View style={styles.disclaimerRow}>
            <Ionicons name="information-circle-outline" size={16} color="#9CA3AF" />
            <Text style={styles.disclaimerText}>
              Fare shown is an estimate until payment is completed. Final amount may vary based on
              route and waiting time.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <RideInvoiceEmailGateSheet
        visible={emailGateVisible}
        mode={emailGateMode}
        email={profile?.email}
        sending={sendInvoiceMutation.isPending}
        onClose={closeEmailGate}
        onAddEmail={handleAddEmail}
        onVerifyEmail={handleVerifyEmail}
        onConfirmSend={handleConfirmSendInvoice}
      />

      {invoiceSentToast ? (
        <View style={styles.invoiceSentToastWrap} pointerEvents="none">
          <View style={styles.invoiceSentToastCard}>
            <Ionicons name="checkmark-circle" size={22} color={GREEN} />
            <View style={styles.invoiceSentToastTextCol}>
              <Text style={styles.invoiceSentToastTitle}>Invoice sent</Text>
              <Text style={styles.invoiceSentToastMsg}>{invoiceSentToast}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: PAGE_BG,
  },
  headerSide: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  scroll: { flex: 1 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLeft: {
    flex: 1,
  },
  rideTypeTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  rideDate: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 8,
  },
  rideFare: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  rideFareRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 4,
  },
  fareTotalDiscountRowLg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  fareTotalDiscountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fareTotalStruckLg: {
    fontSize: 18,
    fontWeight: "700",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  fareTotalStruck: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9CA3AF",
    textDecorationLine: "line-through",
  },
  fareTotalFinalLg: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  fareTotalFinal: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  estTag: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  summaryRight: {
    alignItems: "flex-end",
    gap: 8,
  },
  summaryVehicle: {
    width: 72,
    height: 48,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
  },
  statusBadgeCompleted: {
    backgroundColor: "#ECFDF5",
  },
  statusBadgeCancelled: {
    backgroundColor: "#FEF2F2",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  statusBadgeTextCompleted: {
    color: GREEN,
  },
  statusBadgeTextCancelled: {
    color: "#DC2626",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  sectionBody: {
    marginTop: 14,
  },
  rideIdText: {
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 12,
  },
  routeStopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 4,
  },
  routeRailCol: {
    width: 16,
    alignItems: "center",
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  routeDotPickup: {
    backgroundColor: GREEN,
  },
  routeDotDrop: {
    backgroundColor: "#EF4444",
  },
  routeRail: {
    width: 2,
    flex: 1,
    minHeight: 24,
    borderStyle: "dashed",
    borderLeftWidth: 2,
    borderColor: "#D1D5DB",
    marginTop: 2,
  },
  routeAddress: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
    paddingBottom: 10,
  },
  tripStats: {
    marginTop: 4,
    fontSize: 12,
    color: "#9CA3AF",
  },
  helpBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  helpIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  helpTextWrap: {
    flex: 1,
  },
  helpTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2563EB",
  },
  helpSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  invoiceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  invoiceHeaderText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: 0.6,
  },
  fareHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  fareHeaderLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  fareHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fareHeaderAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  fareBreakdown: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    gap: 10,
  },
  fareLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 8,
  },
  fareLineLabel: {
    fontSize: 14,
    color: "#6B7280",
    flex: 1,
    paddingRight: 8,
  },
  fareLineDiscountLabel: {
    color: "#374151",
  },
  fareLineValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  fareLineDiscount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
  },
  tipInvoiceNoteBlock: {
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    gap: 8,
  },
  tipInvoiceNote: {
    fontSize: 12,
    lineHeight: 17,
    color: "#9CA3AF",
  },
  tipInvoiceMathRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingLeft: 8,
  },
  tipInvoiceMath: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "right",
    color: "#374151",
  },
  tipInvoiceMathValue: {
    fontWeight: "600",
    color: "#374151",
  },
  tipInvoiceMathOp: {
    color: "#6B7280",
  },
  tipInvoiceMathTotal: {
    fontWeight: "800",
    color: "#111827",
  },
  invoiceDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 14,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  emailRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
  },
  disclaimerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 4,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: "#9CA3AF",
  },
  billLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  billLoadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
  invoiceSentToastWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    zIndex: 20,
  },
  invoiceSentToastCard: {
    width: "86%",
    maxWidth: 340,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  invoiceSentToastTextCol: {
    flex: 1,
    gap: 4,
  },
  invoiceSentToastTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  invoiceSentToastMsg: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4B5563",
  },
});
