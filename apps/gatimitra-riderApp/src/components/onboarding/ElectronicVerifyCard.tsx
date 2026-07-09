/**
 * ElectronicVerifyCard — rider-app hybrid verification widget.
 *
 * Shown on onboarding steps whose document mode (Policy Center) is auto or
 * hybrid. The rider enters only the document number; tapping Verify runs the
 * Cashfree check through the backend. States:
 *
 *   verified → green card with the provider's fetched details; the photo
 *              upload for this document is no longer required.
 *   failed + hybrid → amber card; the classic photo upload is revealed.
 *   failed + auto   → red card; the rider must retry later (no upload path).
 *   manual (policy) → widget hidden by the parent; classic flow runs.
 */
import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type EvState =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "verified"; details: Record<string, unknown> }
  | { phase: "failed"; error: string }
  | { phase: "manual" };

const DETAIL_LABELS: Record<string, string> = {
  registered_name: "Registered name",
  name_match_result: "Name match",
  pan_status: "PAN status",
  dob: "Date of birth",
  holder_name: "Holder name",
  license_type: "Licence type",
  valid_till: "Valid till",
  owner_name: "Owner name",
  maker_model: "Maker / model",
  vehicle_class: "Vehicle class",
  registration_date: "Registered",
  insurance_upto: "Insurance valid till",
  fitness_upto: "Fitness valid till",
};

export function ElectronicVerifyCard(props: {
  mode: "auto" | "hybrid";
  state: EvState;
  disabled?: boolean;
  onVerify: () => void;
  verifyLabel: string;
}) {
  const { mode, state, disabled, onVerify, verifyLabel } = props;

  if (state.phase === "verified") {
    const rows = Object.entries(state.details)
      .filter(([k, v]) => v != null && typeof v !== "object" && DETAIL_LABELS[k])
      .slice(0, 6);
    return (
      <View style={[styles.card, styles.cardVerified]}>
        <View style={styles.headerRow}>
          <Ionicons name="shield-checkmark" size={18} color="#059669" />
          <Text style={styles.verifiedTitle}>Verified electronically</Text>
        </View>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.detailRow}>
            <Text style={styles.detailLabel}>{DETAIL_LABELS[k]}</Text>
            <Text style={styles.detailValue}>{String(v)}</Text>
          </View>
        ))}
        <Text style={styles.verifiedHint}>No document photo needed.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={[styles.button, (disabled || state.phase === "verifying") && styles.buttonDisabled]}
        disabled={disabled || state.phase === "verifying"}
        onPress={onVerify}
        activeOpacity={0.8}
      >
        {state.phase === "verifying" ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="flash" size={16} color="#fff" />
        )}
        <Text style={styles.buttonText}>
          {state.phase === "verifying" ? "Verifying…" : verifyLabel}
        </Text>
      </TouchableOpacity>

      {state.phase === "failed" && mode === "auto" ? (
        <View style={[styles.notice, styles.noticeError]}>
          <Ionicons name="close-circle" size={16} color="#be123c" />
          <Text style={styles.noticeErrorText}>
            {state.error} Please re-check the number or try again after some time. Electronic
            verification is required to continue.
          </Text>
        </View>
      ) : null}
      {state.phase === "failed" && mode === "hybrid" ? (
        <View style={[styles.notice, styles.noticeWarn]}>
          <Ionicons name="alert-circle" size={16} color="#b45309" />
          <Text style={styles.noticeWarnText}>
            Instant verification didn't succeed. Upload a clear photo of the document below — our
            team will verify it manually.
          </Text>
        </View>
      ) : null}
      {state.phase === "manual" ? (
        <View style={[styles.notice, styles.noticeInfo]}>
          <Ionicons name="time" size={16} color="#4f46e5" />
          <Text style={styles.noticeInfoText}>
            Queued for manual verification. Upload the document photo to speed it up.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, gap: 8 },
  cardVerified: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    padding: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  verifiedTitle: { fontSize: 14, fontWeight: "700", color: "#065f46" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  detailLabel: { fontSize: 12, color: "#047857" },
  detailValue: { fontSize: 12, fontWeight: "600", color: "#064e3b", maxWidth: "60%", textAlign: "right" },
  verifiedHint: { marginTop: 6, fontSize: 11, color: "#059669" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#4f46e5",
    borderRadius: 10,
    paddingVertical: 11,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  notice: { flexDirection: "row", gap: 6, borderRadius: 10, borderWidth: 1, padding: 10 },
  noticeError: { backgroundColor: "#fff1f2", borderColor: "#fecdd3" },
  noticeErrorText: { flex: 1, fontSize: 12, color: "#be123c", lineHeight: 17 },
  noticeWarn: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  noticeWarnText: { flex: 1, fontSize: 12, color: "#b45309", lineHeight: 17 },
  noticeInfo: { backgroundColor: "#eef2ff", borderColor: "#c7d2fe" },
  noticeInfoText: { flex: 1, fontSize: 12, color: "#4f46e5", lineHeight: 17 },
});
