/**
 * Reusable checkout address bottom sheet — saved addresses + Out of Delivery Zone pills.
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { useAddresses } from "@/hooks/useAddresses";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { DeliveryAddressText } from "@/components/address/DeliveryAddressText";
import { haversineKm, SERVICE_RADIUS_KM } from "@/lib/billSummary";
import { getStoreDeliveryQuote, type StoreDeliveryQuote } from "@/services/distance.service";
import { merchantService } from "@/services/merchant.service";
import type { Address } from "@/services/address.service";

import { openCheckoutAddAddress } from "@/lib/openCheckoutAddAddress";
import { OutOfDeliveryZoneSheet } from "@/components/checkout/OutOfDeliveryZoneSheet";

const CX = {
  mint: "#2DB5A0",
} as const;

function checkoutAddressRowIcon(
  label: string | null | undefined,
  contactName: string | null | undefined
): React.ComponentProps<typeof Ionicons>["name"] {
  if (contactName?.trim()) return "person-outline";
  if (!label?.trim()) return "location-outline";
  const l = label.toLowerCase();
  if (l === "home") return "home-outline";
  if (l === "work") return "briefcase-outline";
  return "location-outline";
}

function formatAddressToStoreDistance(
  storeLat: number | null | undefined,
  storeLng: number | null | undefined,
  addr: Address
): string {
  if (storeLat == null || storeLng == null) return "—";
  const km = haversineKm(Number(storeLat), Number(storeLng), addr.latitude, addr.longitude);
  const m = km * 1000;
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${km.toFixed(1)} km`;
}

function isAddressOutOfZone(
  quote: StoreDeliveryQuote | undefined,
  storeLat: number | null | undefined,
  storeLng: number | null | undefined,
  addr: Address
): boolean {
  if (quote?.serviceable === false) return true;
  if (quote?.unserviceable_reason === "out_of_range") return true;
  if (storeLat == null || storeLng == null) return false;
  const km = haversineKm(Number(storeLat), Number(storeLng), addr.latitude, addr.longitude);
  if (!Number.isFinite(km)) return false;
  const radiusKm = quote?.service_radius_km ?? SERVICE_RADIUS_KM;
  if (quote != null) return !quote.serviceable;
  return km > radiusKm;
}

export type CheckoutAddressSelectSheetProps = {
  visible: boolean;
  merchantId: string | null;
  selectedAddressId?: number | null;
  onClose: () => void;
  onSelectAddress: (addr: Address) => void | Promise<void>;
};

export function CheckoutAddressSelectSheet({
  visible,
  merchantId,
  selectedAddressId,
  onClose,
  onSelectAddress,
}: CheckoutAddressSelectSheetProps) {
  const router = useRouter();
  const insets = useAppSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { data: addresses = [], isLoading: addressesLoading } = useAddresses();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [outOfZoneMessageVisible, setOutOfZoneMessageVisible] = useState(false);

  const { data: merchant } = useQuery({
    queryKey: ["merchant", merchantId, "address-sheet"],
    queryFn: () => merchantService.getMerchantById(merchantId!),
    enabled: visible && !!merchantId,
    staleTime: 5 * 60 * 1000,
  });

  const serviceability = useQueries({
    queries: addresses.map((addr) => ({
      queryKey: ["store-delivery-quote", merchantId, addr.id, "checkout-address-sheet"],
      queryFn: () =>
        getStoreDeliveryQuote({
          storeId: merchantId!,
          addressId: addr.id,
          serviceType: "FOOD",
        }),
      enabled: visible && !!merchantId,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const handleSelect = useCallback(
    async (addr: Address, isOutOfZone: boolean, isDeliverable: boolean) => {
      if (busyId != null) return;
      if (isOutOfZone) {
        setOutOfZoneMessageVisible(true);
        return;
      }
      // A row is selectable only after the canonical store quote explicitly
      // confirms serviceability. Unknown/loading/error states never select.
      if (!isDeliverable || !merchantId) return;
      setBusyId(addr.id);
      try {
        const latestQuote = await getStoreDeliveryQuote({
          storeId: merchantId,
          addressId: addr.id,
          serviceType: "FOOD",
          skipCache: true,
        });
        if (!latestQuote.serviceable) {
          setOutOfZoneMessageVisible(true);
          return;
        }
        await onSelectAddress(addr);
      } finally {
        setBusyId(null);
      }
    },
    [busyId, merchantId, onSelectAddress]
  );

  const storeLat = merchant?.latitude ?? null;
  const storeLng = merchant?.longitude ?? null;
  const listMaxHeight = Math.min(420, Math.round(windowHeight * 0.55));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.dim} onPress={onClose} />
        <View
            style={[
              styles.card,
              {
                paddingBottom: Math.max(insets.bottom, 4),
              },
            ]}
        >
          <View style={styles.closeWrap}>
            <Pressable style={styles.closeRing} onPress={onClose} hitSlop={14} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          <CheckoutText style={styles.title}>Select an address</CheckoutText>

          <View style={styles.actionPanel}>
            <Pressable
              style={styles.actionRow}
              onPress={() => {
                void openCheckoutAddAddress({
                  router,
                  closeAddressSheet: onClose,
                  hideCheckoutDrawer: true,
                  hideCartGate: true,
                });
              }}
              android_ripple={{ color: "rgba(45, 181, 160, 0.12)" }}
            >
              <View style={styles.actionLeft}>
                <Ionicons name="add" size={22} color={CX.mint} />
                <View style={styles.actionTextCol}>
                  <CheckoutText style={styles.actionTitle}>Add Address</CheckoutText>
                  <CheckoutText style={styles.actionSub} numberOfLines={1}>
                    Search area or drop a pin on the map
                  </CheckoutText>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </Pressable>
          </View>

          <CheckoutText style={styles.sectionLabel}>SAVED ADDRESSES</CheckoutText>

          {addressesLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={CX.mint} />
            </View>
          ) : addresses.length === 0 ? (
            <CheckoutText style={styles.empty}>
              No saved addresses yet. Tap Add Address to save a delivery location.
            </CheckoutText>
          ) : (
            <ScrollView
              style={[styles.scroll, { maxHeight: listMaxHeight }]}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <View style={[styles.actionPanel, styles.actionPanelInScroll]}>
                {addresses.map((addr, index) => {
                  const busy = busyId === addr.id;
                  const dist = formatAddressToStoreDistance(storeLat, storeLng, addr);
                  const title = addr.contactName?.trim() || addr.label || "Saved address";
                  const quote = serviceability[index]?.data;
                  const isOutOfZone = isAddressOutOfZone(quote, storeLat, storeLng, addr);
                  const isDeliverable = quote?.serviceable === true;
                  const isChecking = serviceability[index]?.isPending === true;
                  const isSelected = selectedAddressId === addr.id && isDeliverable;
                  const showLabel =
                    addr.label?.trim() &&
                    addr.label.trim().toLowerCase() !== title.toLowerCase();
                  return (
                    <Pressable
                      key={addr.id}
                      style={[
                        styles.actionRow,
                        isSelected && styles.actionRowSelected,
                        isOutOfZone && styles.actionRowUnavailable,
                        index === addresses.length - 1 && styles.actionRowLast,
                      ]}
                      onPress={() => void handleSelect(addr, isOutOfZone, isDeliverable)}
                      disabled={busyId != null || (!isOutOfZone && !isDeliverable)}
                      accessibilityState={{ disabled: !isDeliverable }}
                      android_ripple={
                        isOutOfZone ? undefined : { color: "rgba(45, 181, 160, 0.1)" }
                      }
                    >
                      <View style={styles.actionLeft}>
                        {busy ? (
                          <ActivityIndicator size="small" color={CX.mint} />
                        ) : (
                          <Ionicons
                            name={checkoutAddressRowIcon(addr.label, addr.contactName)}
                            size={22}
                            color={isOutOfZone ? "#9CA3AF" : CX.mint}
                          />
                        )}
                        <View style={styles.actionTextCol}>
                          {isOutOfZone ? (
                            <View style={styles.outOfZonePill}>
                              <CheckoutText style={styles.outOfZonePillText}>
                                Out of Delivery Zone
                              </CheckoutText>
                            </View>
                          ) : null}
                          <CheckoutText style={styles.actionTitle} numberOfLines={1}>
                            {title}
                          </CheckoutText>
                          {showLabel ? (
                            <CheckoutText style={styles.actionLabel} numberOfLines={1}>
                              {addr.label}
                            </CheckoutText>
                          ) : null}
                          <DeliveryAddressText
                            variant="checkout"
                            address={addr.fullAddress}
                            style={styles.actionSub}
                          />
                          {dist !== "—" ? (
                            <CheckoutText style={styles.actionDist}>{dist}</CheckoutText>
                          ) : null}
                        </View>
                      </View>
                      {isOutOfZone ? null : isChecking ? (
                        <ActivityIndicator size="small" color="#9CA3AF" />
                      ) : isSelected ? (
                        <View style={styles.selectedPill}>
                          <CheckoutText style={styles.selectedPillText}>SELECTED</CheckoutText>
                        </View>
                      ) : isDeliverable ? (
                        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
      <OutOfDeliveryZoneSheet
        visible={outOfZoneMessageVisible}
        onClose={() => setOutOfZoneMessageVisible(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  closeWrap: { alignItems: "center", marginTop: -18, marginBottom: 14, zIndex: 4 },
  closeRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  actionPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10,
    overflow: "hidden",
  },
  actionPanelInScroll: {
    marginBottom: 0,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8ECF0",
    gap: 10,
  },
  actionRowLast: { borderBottomWidth: 0 },
  actionRowSelected: { backgroundColor: "#F0FDFA" },
  actionRowUnavailable: { backgroundColor: "#FAFAFA" },
  actionLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  actionTextCol: { flex: 1, minWidth: 0 },
  actionTitle: { fontSize: 15, fontWeight: "700", color: "#111827", lineHeight: 20 },
  actionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 2,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  actionSub: { fontSize: 12, color: "#4B5563", marginTop: 4, lineHeight: 17 },
  actionDist: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9CA3AF",
    marginTop: 4,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  outOfZonePill: {
    alignSelf: "flex-start",
    backgroundColor: "#FEE2E2",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 5,
  },
  outOfZonePillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#DC2626",
    letterSpacing: 0.5,
  },
  selectedPill: {
    backgroundColor: CX.mint,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectedPillText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#8CA3C4",
    letterSpacing: 1.1,
    marginTop: 10,
    marginBottom: 8,
  },
  loading: { paddingVertical: 28, alignItems: "center" },
  empty: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  scroll: { flexGrow: 0 },
  scrollContent: { flexGrow: 0, paddingBottom: 0 },
});
