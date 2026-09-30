import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { riderApi, type RiderLedgerEntryDetail } from "@/src/services/api/riderApi";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { formatLedgerAmount, formatLedgerDateTime } from "@/src/components/ledger/ledgerDisplay";

type Props = {
  entryId: number | null;
  onClose: () => void;
};

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  if (!text) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{text}</Text>
    </View>
  );
}

function purposeLabel(detail: RiderLedgerEntryDetail): string | null {
  const purpose = detail.purpose?.toLowerCase() ?? "";
  if (purpose === "negative_wallet_recovery") return "Negative wallet settlement";
  if (purpose === "penalty" || detail.entryType === "penalty") return "Penalty payment";
  if (detail.entryType === "subscription_fee") return "Subscription payment";
  if (purpose) return purpose.replace(/_/g, " ");
  return null;
}

function serviceLabel(service: string | null): string | null {
  const s = service?.toLowerCase() ?? "";
  if (s === "food") return "Food";
  if (s === "parcel") return "Parcel";
  if (s === "ride" || s === "person_ride") return "Ride";
  return service;
}

export function LedgerPaymentDetailSheet({ entryId, onClose }: Props) {
  const { t } = useTranslation();
  const bottomInset = useRiderBottomInset();
  const visible = entryId != null;
  const { data, isPending, isError } = useQuery({
    queryKey: ["rider", "ledger", "entry", entryId],
    queryFn: () => riderApi.getLedgerEntry(entryId as number),
    enabled: visible,
  });

  const credit = data?.flow === "credit";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: bottomInset }]}>
          <View style={styles.handle} />
          <Text style={styles.heading}>{t("ledger.paymentDetails", "Payment details")}</Text>
          {isPending ? (
            <ActivityIndicator style={styles.loader} color="#0F766E" />
          ) : isError || !data ? (
            <Text style={styles.missing}>{t("ledger.detailMissing", "This transaction could not be loaded.")}</Text>
          ) : (
            <ScrollView>
              <Text style={[styles.amount, credit ? styles.credit : styles.debit]}>
                {credit ? "+" : "−"} ₹{formatLedgerAmount(data.amount)}
              </Text>
              <Text style={styles.status}>{credit ? "Credit" : "Debit"}</Text>
              <Row label="Description" value={data.description} />
              <Row label="Purpose" value={purposeLabel(data)} />
              <Row label="Service" value={serviceLabel(data.serviceType)} />
              <Row label="Payment method" value={data.paymentMethod} />
              <Row label="Payment status" value={data.paymentStatus} />
              <Row label="Transaction ID" value={String(data.id)} />
              <Row label="Payment record" value={data.paymentRecordId != null ? String(data.paymentRecordId) : null} />
              <Row label="Razorpay payment ID" value={data.razorpayPaymentId} />
              <Row label="Razorpay order ID" value={data.razorpayOrderId} />
              <Row label="Order / ride" value={data.orderPublicId} />
              <Row label="Currency" value={data.currency} />
              <Row label="Created" value={formatLedgerDateTime(data.createdAt)} />
              <Row label="Processed" value={data.processedAt ? formatLedgerDateTime(data.processedAt) : null} />
              <Row label="Refund status" value={data.refundStatus} />
              <Row label="Refund ID" value={data.refundId} />
            </ScrollView>
          )}
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>{t("common.close", "Close")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    maxHeight: "82%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 12,
  },
  heading: { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8 },
  amount: { fontSize: 28, fontWeight: "800" },
  credit: { color: "#15803D" },
  debit: { color: "#B91C1C" },
  status: { marginTop: 2, marginBottom: 12, color: "#475569", fontWeight: "600" },
  row: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB" },
  label: { fontSize: 12, color: "#6B7280", marginBottom: 2 },
  value: { fontSize: 14, fontWeight: "600", color: "#111827" },
  loader: { marginVertical: 24 },
  missing: { color: "#6B7280", marginVertical: 16 },
  close: {
    marginTop: 8,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
