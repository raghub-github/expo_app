/**
 * Profile → Vehicles & Documents (Phase 3). Backend-authoritative: renders each vehicle's
 * per-vehicle service eligibility + which one is active, and lets the rider pick the active
 * vehicle (with a confirmation showing that vehicle's available services, §8/§36).
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRiderVehicles } from "@/src/hooks/useRiderVehicles";
import { useRiderOnboardingSummary } from "@/src/hooks/useRiderOnboardingSummary";
import type { RiderVehicleView } from "@/src/services/api/riderApi";
import { colors } from "@/src/theme";
import { RiderFonts } from "@/src/theme/fonts";
import { useDocumentUpdateSheetStore } from "@/src/stores/documentUpdateSheetStore";

const TEAL = "#0F766E";
const TEAL_DARK = "#115E59";
const SERVICE_LABEL: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};
const SERVICE_ORDER = ["food", "parcel", "person_ride"] as const;

const human = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const classLabel = (c: string | null) =>
  c === "2_wheeler"
    ? "2 Wheeler"
    : c === "3_wheeler"
      ? "3 Wheeler"
      : c === "4_wheeler"
        ? "4 Wheeler"
        : "Vehicle";

const classIcon = (c: string | null): keyof typeof Ionicons.glyphMap =>
  c === "2_wheeler" ? "bicycle" : c === "3_wheeler" ? "car-sport" : "car";

/** Prefer full RC; fall back to masked if full number is missing. */
function displayRegistration(v: Pick<RiderVehicleView, "registrationNumber" | "registrationMasked">) {
  const full = (v.registrationNumber ?? "").trim().toUpperCase();
  if (full.length > 0) return full;
  return (v.registrationMasked ?? "").trim().toUpperCase();
}

function formatOwnership(ownership: string) {
  const key = ownership.toLowerCase();
  if (key.includes("own")) return "Owned";
  if (key.includes("rent") || key.includes("hire")) return "Rented";
  return human(ownership);
}

function DlStatusCard({
  state,
  requiredForSomeService,
  onUpload,
}: {
  state: string;
  requiredForSomeService: boolean;
  onUpload?: () => void;
}) {
  const verified = state.includes("VERIFIED");
  const expired = state === "EXPIRED";
  const tone = verified ? "#047857" : expired ? "#DC2626" : "#B45309";
  const bg = verified ? "#ECFDF5" : expired ? "#FEF2F2" : "#FFFBEB";
  const border = verified ? "#A7F3D0" : expired ? "#FECACA" : "#FDE68A";
  const canUpload = Boolean(onUpload) && !verified;

  return (
    <Pressable
      disabled={!canUpload}
      onPress={onUpload}
      style={({ pressed }) => [
        styles.dlCard,
        { backgroundColor: bg, borderColor: border },
        canUpload && pressed && { opacity: 0.92 },
      ]}
      accessibilityRole={canUpload ? "button" : undefined}
      accessibilityLabel={canUpload ? "Upload driving licence" : undefined}
    >
      <View style={[styles.dlIconWrap, { backgroundColor: "#FFFFFF" }]}>
        <Ionicons
          name={verified ? "shield-checkmark" : expired ? "warning" : "document-text-outline"}
          size={22}
          color={tone}
        />
      </View>
      <View style={styles.dlCopy}>
        <Text style={styles.dlEyebrow}>Driving licence</Text>
        <Text style={[styles.dlState, { color: tone }]}>{human(state)}</Text>
        {requiredForSomeService ? (
          <Text style={styles.dlHint}>Required for some services on your account</Text>
        ) : null}
        {canUpload ? (
          <Text style={styles.dlUploadHint}>Tap to upload and unblock services</Text>
        ) : null}
      </View>
      {canUpload ? (
        <View style={styles.dlUploadChip}>
          <Ionicons name="cloud-upload-outline" size={14} color={TEAL_DARK} />
          <Text style={styles.dlUploadChipText}>Upload</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ServiceRow({
  label,
  eligible,
  reason,
}: {
  label: string;
  eligible: boolean;
  reason?: string;
}) {
  return (
    <View style={[styles.serviceRow, eligible ? styles.serviceRowOk : styles.serviceRowBad]}>
      <Ionicons
        name={eligible ? "checkmark-circle" : "close-circle"}
        size={18}
        color={eligible ? "#16A34A" : "#DC2626"}
      />
      <View style={styles.serviceCopy}>
        <Text style={styles.serviceLabel}>{label}</Text>
        {!eligible && reason ? <Text style={styles.serviceReason}>{reason}</Text> : null}
        {eligible ? <Text style={styles.serviceOkHint}>Eligible on this vehicle</Text> : null}
      </View>
    </View>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function VehicleCard({
  v,
  onUse,
  busy,
}: {
  v: RiderVehicleView;
  onUse: (v: RiderVehicleView) => void;
  busy: boolean;
}) {
  const plate = displayRegistration(v);
  const typeLabel = v.vehicleType ? human(v.vehicleType) : classLabel(v.vehicleClass);

  return (
    <View style={[styles.card, v.isActiveVehicle && styles.cardActive]}>
      <View style={styles.cardTop}>
        <View style={styles.vehIcon}>
          <Ionicons name={classIcon(v.vehicleClass)} size={26} color={TEAL_DARK} />
        </View>
        <View style={styles.cardTopCopy}>
          <Text style={styles.vehClass}>{classLabel(v.vehicleClass)}</Text>
          {v.vehicleType ? <Text style={styles.vehType}>{typeLabel}</Text> : null}
        </View>
        {v.isActiveVehicle ? (
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#047857" />
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.plateBlock}>
        <Text style={styles.plateLabel}>Registration number</Text>
        <Text style={styles.plateNumber} selectable>
          {plate || "—"}
        </Text>
      </View>

      <View style={styles.metaRow}>
        {v.fuelKind ? (
          <View style={styles.metaPill}>
            <Ionicons name="flash-outline" size={12} color="#475569" />
            <Text style={styles.metaPillText}>{human(v.fuelKind)}</Text>
          </View>
        ) : null}
        <View style={styles.metaPill}>
          <Ionicons name="briefcase-outline" size={12} color="#475569" />
          <Text style={styles.metaPillText}>{v.commercial ? "Commercial" : "Non-commercial"}</Text>
        </View>
        <View style={[styles.metaPill, v.verified ? styles.metaPillOk : styles.metaPillPending]}>
          <Ionicons
            name={v.verified ? "shield-checkmark" : "time-outline"}
            size={12}
            color={v.verified ? "#047857" : "#B45309"}
          />
          <Text style={[styles.metaPillText, v.verified ? styles.metaPillOkText : styles.metaPillPendingText]}>
            {v.verified ? "Verified" : "Pending"}
          </Text>
        </View>
      </View>

      <View style={styles.detailsGrid}>
        <DetailCell label="Ownership" value={formatOwnership(v.ownership)} />
        <DetailCell label="Status" value={human(v.status)} />
        {v.vehicleType ? <DetailCell label="Vehicle type" value={typeLabel} /> : null}
        <DetailCell label="Class" value={classLabel(v.vehicleClass)} />
      </View>

      <Text style={styles.sectionLabel}>Services with this vehicle</Text>
      <View style={styles.services}>
        {SERVICE_ORDER.map((s) => {
          const d = v.services[s];
          const reason = d.missingDocuments?.length
            ? `Needs ${d.missingDocuments.map((m) => human(m)).join(", ")}`
            : d.blocking?.[0]?.reason;
          return (
            <ServiceRow
              key={s}
              label={SERVICE_LABEL[s] ?? s}
              eligible={d.eligible}
              reason={reason}
            />
          );
        })}
      </View>

      {!v.isActiveVehicle ? (
        v.verified ? (
          <Pressable
            style={({ pressed }) => [styles.useBtn, pressed && { opacity: 0.9 }]}
            disabled={busy}
            onPress={() => onUse(v)}
          >
            <Text style={styles.useBtnText}>Use this vehicle</Text>
          </Pressable>
        ) : (
          <Text style={styles.pendingNote}>Complete verification to use this vehicle.</Text>
        )
      ) : (
        <View style={styles.activeNote}>
          <Ionicons name="information-circle-outline" size={16} color={TEAL_DARK} />
          <Text style={styles.activeNoteText}>Orders are assigned on this vehicle.</Text>
        </View>
      )}
    </View>
  );
}

export function VehiclesAndDocumentsScreen() {
  const { vehicles, isLoading, error, refetch, setActiveVehicle, isSettingActive } = useRiderVehicles();
  const { summary } = useRiderOnboardingSummary();
  const [confirm, setConfirm] = useState<RiderVehicleView | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const dl = summary?.documents?.find((d) => d.code === "DRIVING_LICENSE");
  const maxVehicles = 2;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  async function confirmUse() {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    setBanner(null);
    try {
      const res = await setActiveVehicle(target.id);
      if (!res.ok) setBanner(res.reason ?? "Could not switch vehicle.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not switch vehicle.";
      setBanner(
        msg.includes("active order")
          ? "Vehicle cannot be switched while active orders are assigned."
          : "Could not switch vehicle.",
      );
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Vehicles & Documents</Text>
          <Text style={styles.headerSub}>
            {vehicles.length}/{maxVehicles} vehicles on file
          </Text>
        </View>
      </View>

      {isLoading && vehicles.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TEAL} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={40} color="#94A3B8" />
          <Text style={styles.centerText}>Could not load your vehicles.</Text>
          <Pressable onPress={() => void refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={TEAL} />
          }
        >
          {banner ? (
            <View style={styles.banner}>
              <Ionicons name="alert-circle" size={18} color="#B45309" />
              <Text style={styles.bannerText}>{banner}</Text>
            </View>
          ) : null}

          {dl ? (
            <DlStatusCard
              state={dl.state}
              requiredForSomeService={dl.requiredForSomeService}
              onUpload={
                dl.state.includes("VERIFIED")
                  ? undefined
                  : () => useDocumentUpdateSheetStore.getState().open("dl")
              }
            />
          ) : null}

          <Text style={styles.listHeading}>Your vehicles</Text>

          {vehicles.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="bicycle-outline" size={36} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No vehicles on file</Text>
              <Text style={styles.emptyText}>
                Contact support to add a vehicle. Self-service add will be available soon.
              </Text>
            </View>
          ) : (
            vehicles.map((v) => (
              <VehicleCard key={v.id} v={v} busy={isSettingActive} onUse={setConfirm} />
            ))
          )}

          <View style={styles.footerCard}>
            <Ionicons name="lock-closed-outline" size={16} color="#64748B" />
            <Text style={styles.footerNote}>
              Vehicle data is verified via Cashfree and cannot be edited manually. To add or replace
              a vehicle, contact support.
            </Text>
          </View>
        </ScrollView>
      )}

      <Modal visible={confirm != null} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Use this vehicle?</Text>
            {confirm ? (
              <>
                <Text style={styles.modalVeh}>
                  {classLabel(confirm.vehicleClass)} · {displayRegistration(confirm)}
                </Text>
                <Text style={styles.modalSub}>Your orders will be assigned per this vehicle&apos;s services:</Text>
                <View style={styles.modalServices}>
                  {SERVICE_ORDER.map((s) => (
                    <ServiceRow
                      key={s}
                      label={SERVICE_LABEL[s] ?? s}
                      eligible={confirm.services[s].eligible}
                    />
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setConfirm(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalGo]}
                onPress={() => void confirmUse()}
                disabled={isSettingActive}
              >
                <Text style={styles.modalGoText}>{isSettingActive ? "…" : "Use vehicle"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: { padding: 4 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 20,
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  headerSub: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12.5,
    color: "#64748B",
    marginTop: 2,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  centerText: { fontFamily: RiderFonts.poppinsSemiBold, fontSize: 14, color: "#64748B" },
  retryBtn: {
    marginTop: 6,
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryBtnText: { fontFamily: RiderFonts.poppinsBold, color: "#FFFFFF" },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 14,
    padding: 12,
  },
  bannerText: {
    flex: 1,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 13,
    color: "#92400E",
  },
  dlCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  dlIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  dlCopy: { flex: 1, minWidth: 0 },
  dlEyebrow: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 11,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  dlState: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 16,
    marginTop: 2,
  },
  dlHint: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  dlUploadHint: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12,
    color: TEAL_DARK,
    marginTop: 4,
  },
  dlUploadChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#99F6E4",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dlUploadChipText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 12,
    color: TEAL_DARK,
  },
  listHeading: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 13,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 12,
  },
  cardActive: {
    borderColor: "#5EEAD4",
    backgroundColor: "#F0FDFA",
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  vehIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTopCopy: { flex: 1, minWidth: 0 },
  vehClass: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 17,
    color: "#0F172A",
  },
  vehType: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12.5,
    color: "#64748B",
    marginTop: 2,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  activeBadgeText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 11.5,
    color: "#047857",
  },
  plateBlock: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  plateLabel: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 11,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  plateNumber: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 22,
    color: "#FFFFFF",
    letterSpacing: 1.4,
    marginTop: 4,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F5F9",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaPillText: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12,
    color: "#475569",
  },
  metaPillOk: { backgroundColor: "#D1FAE5" },
  metaPillPending: { backgroundColor: "#FEF3C7" },
  metaPillOkText: { color: "#047857" },
  metaPillPendingText: { color: "#B45309" },
  detailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailCell: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailLabel: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 11,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detailValue: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 13.5,
    color: "#0F172A",
    marginTop: 3,
  },
  sectionLabel: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#64748B",
    marginTop: 2,
  },
  services: { gap: 8 },
  serviceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  serviceRowOk: {
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  serviceRowBad: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceLabel: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 14,
    color: "#0F172A",
  },
  serviceReason: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  serviceOkHint: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 11.5,
    color: "#15803D",
    marginTop: 2,
  },
  useBtn: {
    marginTop: 6,
    marginHorizontal: 8,
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  useBtnText: {
    fontFamily: RiderFonts.poppinsBold,
    color: "#FFFFFF",
    fontSize: 14.5,
  },
  pendingNote: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12.5,
    color: "#B45309",
  },
  activeNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#CCFBF1",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  activeNoteText: {
    flex: 1,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12.5,
    color: TEAL_DARK,
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 28,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: "#0F172A",
  },
  emptyText: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 19,
  },
  footerCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
  },
  footerNote: {
    flex: 1,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    gap: 8,
  },
  modalTitle: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 17,
    color: "#0F172A",
  },
  modalVeh: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: TEAL,
    letterSpacing: 0.4,
  },
  modalSub: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  modalServices: { gap: 8, marginTop: 6, marginBottom: 4 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  modalCancel: { backgroundColor: "#F1F5F9" },
  modalCancelText: { fontFamily: RiderFonts.poppinsBold, color: "#475569" },
  modalGo: { backgroundColor: colors.primary[500] },
  modalGoText: { fontFamily: RiderFonts.poppinsBold, color: "#FFFFFF" },
});
