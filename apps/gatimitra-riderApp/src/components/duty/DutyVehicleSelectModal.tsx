import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RiderVehicleView } from "@/src/services/api/riderApi";

const TEAL = "#0F766E";
const SERVICE_ORDER = ["food", "parcel", "person_ride"] as const;
const SERVICE_LABEL: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};

function classLabel(c: string | null) {
  return c === "2_wheeler"
    ? "2 Wheeler"
    : c === "3_wheeler"
      ? "3 Wheeler"
      : c === "4_wheeler"
        ? "4 Wheeler"
        : "Vehicle";
}

function classIcon(c: string | null): keyof typeof Ionicons.glyphMap {
  return c === "2_wheeler" ? "bicycle" : c === "3_wheeler" ? "car-sport" : "car";
}

function plate(v: RiderVehicleView) {
  const full = (v.registrationNumber ?? "").trim().toUpperCase();
  if (full) return full;
  return (v.registrationMasked ?? "").trim().toUpperCase() || "—";
}

export function DutyVehicleSelectModal({
  visible,
  vehicles,
  initialId,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  vehicles: RiderVehicleView[];
  initialId: number | null;
  onCancel: () => void;
  onConfirm: (vehicleId: number) => void;
}) {
  const [picked, setPicked] = useState<number | null>(initialId);

  useEffect(() => {
    setPicked(initialId);
  }, [initialId, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Choose vehicle for this session</Text>
          <Text style={styles.sub}>
            Only one vehicle can be online. Services follow the vehicle you pick.
          </Text>
          {vehicles.map((v) => {
            if (!v.verified || String(v.status).toLowerCase() === "retired") return null;
            const selected = picked === v.id;
            const eligible = SERVICE_ORDER.filter((s) => v.services?.[s]?.eligible).map(
              (s) => SERVICE_LABEL[s],
            );
            return (
              <Pressable
                key={v.id}
                onPress={() => setPicked(v.id)}
                style={[styles.row, selected && styles.rowOn]}
              >
                <View style={styles.icon}>
                  <Ionicons name={classIcon(v.vehicleClass)} size={22} color={TEAL} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cls}>{classLabel(v.vehicleClass)}</Text>
                  <Text style={styles.reg}>{plate(v)}</Text>
                  <Text style={styles.svc} numberOfLines={2}>
                    {eligible.length ? eligible.join(" · ") : "No eligible services"}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={22}
                  color={selected ? TEAL : "#94A3B8"}
                />
              </Pressable>
            );
          })}
          <View style={styles.btns}>
            <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.go, picked == null && { opacity: 0.45 }]}
              disabled={picked == null}
              onPress={() => picked != null && onConfirm(picked)}
            >
              <Text style={styles.goText}>Go ON-DUTY</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    gap: 10,
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  sub: { fontSize: 13, color: "#64748B", lineHeight: 18, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#F8FAFC",
  },
  rowOn: { borderColor: "#5EEAD4", backgroundColor: "#F0FDFA" },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#CCFBF1",
    alignItems: "center",
    justifyContent: "center",
  },
  cls: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  reg: { fontSize: 13, fontWeight: "700", color: "#334155", letterSpacing: 0.4 },
  svc: { fontSize: 12, color: "#64748B", marginTop: 2 },
  btns: { flexDirection: "row", gap: 8, marginTop: 8 },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancel: { backgroundColor: "#F1F5F9" },
  cancelText: { fontWeight: "700", color: "#334155" },
  go: { backgroundColor: TEAL },
  goText: { fontWeight: "800", color: "#FFFFFF" },
});
