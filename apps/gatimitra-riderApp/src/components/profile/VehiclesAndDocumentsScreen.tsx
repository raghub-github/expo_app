/**
 * Profile → Vehicles & Documents (Phase 3). Backend-authoritative: renders each vehicle's
 * per-vehicle service eligibility + which one is active, and lets the rider pick the active
 * vehicle (with a confirmation showing that vehicle's available services, §8/§36). Add /
 * replace / retire RC flows are a follow-up (Phase 3b). DL status comes from the onboarding
 * summary (rider-level document).
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

const TEAL = "#0D9488";
const SERVICE_LABEL: Record<string, string> = { food: "Food", parcel: "Parcel", person_ride: "Person Ride" };
const SERVICE_ORDER = ["food", "parcel", "person_ride"] as const;
const human = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const classLabel = (c: string | null) =>
  c === "2_wheeler" ? "2 Wheeler" : c === "3_wheeler" ? "3 Wheeler" : c === "4_wheeler" ? "4 Wheeler" : "Vehicle";

function ServiceChip({ label, eligible, reason }: { label: string; eligible: boolean; reason?: string }) {
  return (
    <View style={styles.chipRow}>
      <Ionicons
        name={eligible ? "checkmark-circle" : "close-circle"}
        size={16}
        color={eligible ? "#16A34A" : "#DC2626"}
      />
      <Text style={styles.chipText}>{label}</Text>
      {!eligible && reason ? <Text style={styles.chipReason}>— {reason}</Text> : null}
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
  return (
    <View style={[styles.card, v.isActiveVehicle && styles.cardActive]}>
      <View style={styles.cardHeader}>
        <View style={styles.vehIcon}>
          <Ionicons
            name={v.vehicleClass === "2_wheeler" ? "bicycle" : v.vehicleClass === "3_wheeler" ? "car-sport" : "car"}
            size={22}
            color={TEAL}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.vehTitle}>{classLabel(v.vehicleClass)}</Text>
          <Text style={styles.vehReg}>{v.registrationMasked}</Text>
        </View>
        {v.isActiveVehicle ? (
          <View style={styles.activeBadge}>
            <Ionicons name="checkmark-circle" size={13} color="#047857" />
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        {v.fuelKind ? <Text style={styles.metaPill}>{human(v.fuelKind)}</Text> : null}
        <Text style={styles.metaPill}>{v.commercial ? "Commercial" : "Non-commercial"}</Text>
        <Text style={[styles.metaPill, v.verified ? styles.metaPillOk : styles.metaPillPending]}>
          {v.verified ? "✓ Verified" : "Verification pending"}
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Services with this vehicle</Text>
      <View style={styles.services}>
        {SERVICE_ORDER.map((s) => {
          const d = v.services[s];
          const reason = d.missingDocuments?.length
            ? `needs ${d.missingDocuments.map((m) => human(m)).join(", ")}`
            : d.blocking?.[0]?.reason;
          return <ServiceChip key={s} label={SERVICE_LABEL[s] ?? s} eligible={d.eligible} reason={reason} />;
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
      ) : null}
    </View>
  );
}

export function VehiclesAndDocumentsScreen() {
  const { vehicles, isLoading, error, refetch, setActiveVehicle, isSettingActive } = useRiderVehicles();
  const { summary } = useRiderOnboardingSummary();
  const [confirm, setConfirm] = useState<RiderVehicleView | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const dl = summary?.documents?.find((d) => d.code === "DRIVING_LICENSE");

  async function confirmUse() {
    if (!confirm) return;
    const target = confirm;
    setConfirm(null);
    setBanner(null);
    try {
      const res = await setActiveVehicle(target.id);
      if (!res.ok) setBanner(res.reason ?? "Could not switch vehicle.");
    } catch (e) {
      // ApiClient throws on 4xx — surface a friendly message (e.g. live-order guard).
      const msg = e instanceof Error ? e.message : "Could not switch vehicle.";
      setBanner(msg.includes("active order") ? "Vehicle cannot be switched while active orders are assigned." : "Could not switch vehicle.");
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Vehicles & Documents</Text>
          <Text style={styles.headerSub}>{vehicles.length}/2 vehicles</Text>
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
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={TEAL} />}
        >
          {banner ? (
            <View style={styles.banner}>
              <Ionicons name="alert-circle" size={18} color="#B45309" />
              <Text style={styles.bannerText}>{banner}</Text>
            </View>
          ) : null}

          {dl ? (
            <View style={styles.dlCard}>
              <Ionicons
                name={dl.state.includes("VERIFIED") ? "shield-checkmark" : dl.state === "EXPIRED" ? "warning" : "document-text-outline"}
                size={18}
                color={dl.state.includes("VERIFIED") ? "#047857" : dl.state === "EXPIRED" ? "#DC2626" : "#B45309"}
              />
              <Text style={styles.dlText}>
                Driving Licence: <Text style={styles.dlState}>{human(dl.state)}</Text>
                {dl.requiredForSomeService ? "  ·  required for some services" : ""}
              </Text>
            </View>
          ) : null}

          {vehicles.length === 0 ? (
            <Text style={styles.emptyText}>No vehicles on file.</Text>
          ) : (
            vehicles.map((v) => (
              <VehicleCard key={v.id} v={v} busy={isSettingActive} onUse={setConfirm} />
            ))
          )}

          <Text style={styles.footerNote}>
            Vehicle data is verified via Cashfree and cannot be edited manually. To add or replace a vehicle,
            contact support (self-service add/replace is coming soon).
          </Text>
        </ScrollView>
      )}

      {/* Confirm active-vehicle selection (§8/§36). */}
      <Modal visible={confirm != null} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Use this vehicle?</Text>
            {confirm ? (
              <>
                <Text style={styles.modalVeh}>
                  {classLabel(confirm.vehicleClass)} · {confirm.registrationMasked}
                </Text>
                <Text style={styles.modalSub}>Your orders will be assigned per this vehicle&apos;s services:</Text>
                <View style={styles.modalServices}>
                  {SERVICE_ORDER.map((s) => (
                    <ServiceChip key={s} label={SERVICE_LABEL[s] ?? s} eligible={confirm.services[s].eligible} />
                  ))}
                </View>
              </>
            ) : null}
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setConfirm(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalGo]} onPress={confirmUse} disabled={isSettingActive}>
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
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#FFFFFF", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E2E8F0" },
  backBtn: { padding: 4 },
  headerText: {},
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  headerSub: { fontSize: 12.5, color: "#64748B", marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  centerText: { fontSize: 14, color: "#64748B" },
  retryBtn: { marginTop: 6, backgroundColor: TEAL, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9 },
  retryBtnText: { color: "#FFFFFF", fontWeight: "700" },
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", borderRadius: 12, padding: 12 },
  bannerText: { flex: 1, fontSize: 13, color: "#92400E", fontWeight: "600" },
  dlCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12 },
  dlText: { flex: 1, fontSize: 13.5, color: "#334155" },
  dlState: { fontWeight: "700", color: "#0F172A" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E2E8F0", padding: 14, gap: 10 },
  cardActive: { borderColor: "#5EEAD4", backgroundColor: "#F0FDFA" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  vehIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#CCFBF1", alignItems: "center", justifyContent: "center" },
  vehTitle: { fontSize: 15.5, fontWeight: "700", color: "#0F172A" },
  vehReg: { fontSize: 13, color: "#64748B", marginTop: 1, letterSpacing: 0.5 },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#D1FAE5", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontSize: 11.5, fontWeight: "700", color: "#047857" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaPill: { fontSize: 11.5, fontWeight: "600", color: "#475569", backgroundColor: "#F1F5F9", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  metaPillOk: { color: "#047857", backgroundColor: "#D1FAE5" },
  metaPillPending: { color: "#B45309", backgroundColor: "#FEF3C7" },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, color: "#64748B", marginTop: 2 },
  services: { gap: 5 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  chipText: { fontSize: 13.5, fontWeight: "600", color: "#0F172A" },
  chipReason: { fontSize: 12, color: "#6B7280" },
  useBtn: { marginTop: 4, backgroundColor: TEAL, borderRadius: 12, paddingVertical: 11, alignItems: "center" },
  useBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  pendingNote: { fontSize: 12.5, color: "#B45309", fontStyle: "italic" },
  emptyText: { fontSize: 14, color: "#64748B", textAlign: "center", marginTop: 20 },
  footerNote: { fontSize: 12, color: "#94A3B8", lineHeight: 18, marginTop: 4, paddingHorizontal: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 20, gap: 8 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  modalVeh: { fontSize: 14.5, fontWeight: "700", color: TEAL },
  modalSub: { fontSize: 13, color: "#64748B", marginTop: 2 },
  modalServices: { gap: 5, marginTop: 6, marginBottom: 4 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  modalCancel: { backgroundColor: "#F1F5F9" },
  modalCancelText: { fontWeight: "700", color: "#475569" },
  modalGo: { backgroundColor: colors.primary[500] },
  modalGoText: { fontWeight: "700", color: "#FFFFFF" },
});
