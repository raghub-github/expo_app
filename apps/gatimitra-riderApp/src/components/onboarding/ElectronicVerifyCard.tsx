/**
 * ElectronicVerifyCard — rider-app hybrid verification widget.
 *
 * DL mirrors Cashfree Secure ID "Try Driving License":
 * License Number (parent field) + Date of Birth (calendar picker, DD/MM/YYYY) → Verify.
 *
 * For PAN/DL results are also cross-checked against verified Aadhaar.
 * RC verifies the vehicle only (owner may differ from the rider).
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

let DateTimePicker: React.ComponentType<{
  value: Date;
  mode?: "date" | "time" | "datetime";
  display?: string;
  onChange?: (event: { type?: string }, date?: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
}> | null = null;
try {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  DateTimePicker = null;
}

export type EvState =
  | { phase: "idle" }
  | { phase: "verifying" }
  | { phase: "verified"; details: Record<string, unknown> }
  | { phase: "failed"; error: string; providerReference?: string | null; verificationId?: string | null }
  | { phase: "mismatch"; error: string; reasons?: string[] }
  | { phase: "manual" };

const DETAIL_LABELS: Record<string, string> = {
  registered_name: "Registered name",
  name_match_result: "Name match",
  pan_status: "PAN status",
  dob: "Date of Birth",
  date_of_birth: "Date of Birth",
  holder_name: "Full Name",
  name: "Full Name",
  father_or_husband_name: "Father's / Husband's Name",
  dl_number: "DL Number",
  date_of_issue: "Date of Issue",
  class_of_vehicle: "Class of Vehicle",
  dl_validity: "DL Validity",
  dl_validity_summary: "DL Validity",
  permanent_address: "Permanent Address",
  temporary_address: "Temporary Address",
  masked_aadhaar: "Aadhaar",
  aadhaar_number: "Aadhaar",
  uid: "Aadhaar",
  license_type: "Licence type",
  valid_till: "Valid till",
  owner_name: "Owner name",
  owner: "Owner name",
  maker_model: "Maker / model",
  vehicle_class: "Vehicle class",
  registration_date: "Registered",
  reg_date: "Registered",
  insurance_upto: "Insurance valid till",
  fitness_upto: "Fitness valid till",
};

/** Prefer Cashfree Try DL/RC field order. */
const DETAIL_PRIORITY: Record<string, string[]> = {
  "DL Number": ["dl_number"],
  "Date of Birth": ["dob", "date_of_birth"],
  "Class of Vehicle": ["class_of_vehicle"],
  "Date of Issue": ["date_of_issue"],
  "DL Validity": ["dl_validity_summary", "dl_validity"],
  "Full Name": ["name", "holder_name", "registered_name"],
  "Father's / Husband's Name": ["father_or_husband_name"],
  "Permanent Address": ["permanent_address", "address", "present_address"],
  "Temporary Address": ["temporary_address"],
  "Registration number": ["reg_no"],
  Owner: ["owner", "owner_name"],
  "RC status": ["rc_status"],
  "Vehicle class": ["vehicle_class"],
  "Maker / model": ["maker_model", "model", "vehicle_manufacturer_name"],
  Colour: ["vehicle_colour"],
  "Fuel type": ["fuel_type", "type"],
  Registered: ["reg_date", "registration_date"],
  "Insurance valid till": ["vehicle_insurance_upto", "insurance_upto"],
  "Fitness valid till": ["fitness_upto"],
  Aadhaar: ["masked_aadhaar", "aadhaar_number", "uid"],
};

function formatCov(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") return raw.trim() || null;
  if (!Array.isArray(raw)) return null;
  const parts = raw
    .map((x) => {
      if (x == null) return "";
      if (typeof x === "string") return x.trim();
      if (typeof x === "object") {
        const r = x as Record<string, unknown>;
        return String(r.cov ?? r.class_of_vehicle ?? "").trim();
      }
      return String(x).trim();
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function formatDlValidity(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    if (t.startsWith("{")) {
      try {
        return formatDlValidity(JSON.parse(t));
      } catch {
        return t;
      }
    }
    return t;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const lines: string[] = [];
  const rangeLabel = (label: string, block: unknown) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) return;
    const b = block as Record<string, unknown>;
    const from = b.from != null ? String(b.from).trim() : "";
    const to = b.to != null ? String(b.to).trim() : "";
    if (!from && !to) return;
    if (from && to) lines.push(`${label}: ${from} → ${to}`);
    else if (to) lines.push(`${label}: valid till ${to}`);
    else lines.push(`${label}: from ${from}`);
  };
  rangeLabel("Non-transport", v.non_transport);
  rangeLabel("Transport", v.transport);
  if (v.hill_valid_till != null && String(v.hill_valid_till).trim()) {
    lines.push(`Hill: valid till ${String(v.hill_valid_till).trim()}`);
  }
  if (v.hazardous_valid_till != null && String(v.hazardous_valid_till).trim()) {
    lines.push(`Hazardous: valid till ${String(v.hazardous_valid_till).trim()}`);
  }
  return lines.length ? lines.join(" · ") : null;
}

function scalarValue(key: string, raw: unknown): string | null {
  if (raw == null) return null;
  if (key === "class_of_vehicle" || key === "cov_details") {
    return formatCov(raw);
  }
  if (key === "dl_validity" || key === "dl_validity_summary") {
    return formatDlValidity(raw);
  }
  if (typeof raw === "object") return null;
  const value = String(raw).trim();
  return value || null;
}

function buildVerifiedRows(details: Record<string, unknown>): Array<{ label: string; value: string }> {
  const usedKeys = new Set<string>();
  const rows: Array<{ label: string; value: string }> = [];

  const enriched = {
    ...details,
    class_of_vehicle:
      scalarValue("class_of_vehicle", details.class_of_vehicle) ||
      formatCov(details.cov_details) ||
      details.class_of_vehicle,
  };

  for (const [label, keys] of Object.entries(DETAIL_PRIORITY)) {
    for (const key of keys) {
      const value = scalarValue(key, (enriched as Record<string, unknown>)[key]);
      if (!value) continue;
      rows.push({ label, value });
      keys.forEach((k) => usedKeys.add(k));
      usedKeys.add("cov_details");
      break;
    }
  }

  for (const [key, raw] of Object.entries(enriched)) {
    if (usedKeys.has(key)) continue;
    const label = DETAIL_LABELS[key];
    if (!label) continue;
    const value = scalarValue(key, raw);
    if (!value) continue;
    if (rows.some((r) => r.label === label)) continue;
    rows.push({ label, value });
  }

  return rows.slice(0, 12);
}

/** Accept YYYY-MM-DD or DD/MM/YYYY → YYYY-MM-DD. */
export function normalizeDlDobInput(raw: string): string | null {
  const t = String(raw || "").trim();
  const ymd = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const dd = dmy[1]!.padStart(2, "0");
    const mm = dmy[2]!.padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return null;
}

function formatDobDisplay(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function parseYmdToDate(ymd: string): Date | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ElectronicVerifyCard(props: {
  mode: "auto" | "hybrid";
  state: EvState;
  disabled?: boolean;
  onVerify: () => void;
  verifyLabel: string;
  retryLabel?: string;
  verifiedTitle?: string;
  verifiedHint?: string;
  documentLabel?: string;
  /**
   * Cashfree Try DL style: calendar date picker, DD/MM/YYYY display.
   * Value stored as YYYY-MM-DD for Cashfree API.
   */
  requiresDob?: boolean;
  dob?: string;
  onDobChange?: (ymd: string) => void;
}) {
  const {
    mode,
    state,
    disabled,
    onVerify,
    verifyLabel,
    retryLabel,
    verifiedTitle,
    verifiedHint,
    documentLabel = "document",
    requiresDob = false,
    dob = "",
    onDobChange,
  } = props;
  const [failureNoticeDismissed, setFailureNoticeDismissed] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const dobYmd = dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : "";
  const dobDate = dobYmd ? parseYmdToDate(dobYmd) : null;

  const failureKey =
    state.phase === "failed" || state.phase === "mismatch"
      ? `${state.phase}:${state.error}`
      : null;

  useEffect(() => {
    if (!failureKey) {
      setFailureNoticeDismissed(false);
      return;
    }
    setFailureNoticeDismissed(false);
  }, [failureKey]);

  const verifiedRows = useMemo(
    () => (state.phase === "verified" ? buildVerifiedRows(state.details) : []),
    [state],
  );

  const dobOk = !requiresDob || Boolean(dobYmd);
  const verifyDisabled = Boolean(disabled) || state.phase === "verifying" || !dobOk;
  const pickerDisabled = state.phase === "verifying" || Boolean(disabled);

  if (state.phase === "verified") {
    const hasDetailRows = verifiedRows.length > 0;
    return (
      <View style={[styles.card, styles.cardVerified]}>
        <View style={styles.headerRow}>
          <Ionicons name="shield-checkmark" size={18} color="#059669" />
          <Text style={styles.verifiedTitle}>
            {verifiedTitle ||
              (requiresDob ? "Driving License is Valid" : "Vehicle RC is Valid")}
          </Text>
        </View>
        {hasDetailRows ? (
          verifiedRows.map((row) => (
            <View key={row.label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{row.label}</Text>
              <Text style={styles.detailValue}>{row.value}</Text>
            </View>
          ))
        ) : (
          <TouchableOpacity
            style={[styles.button, verifyDisabled && styles.buttonDisabled]}
            disabled={verifyDisabled}
            onPress={onVerify}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={verifyLabel}
          >
            <Ionicons name="flash" size={16} color="#ffffff" />
            <Text style={styles.buttonText}>{verifyLabel}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.verifiedHint}>
          {hasDetailRows
            ? verifiedHint || "Matched with your Aadhaar identity. No photo needed."
            : "Tap Verify Instantly to load vehicle details from Cashfree."}
        </Text>
      </View>
    );
  }

  const buttonLabel =
    state.phase === "verifying"
      ? "Verifying…"
      : state.phase === "failed" || state.phase === "manual" || state.phase === "mismatch"
        ? retryLabel || verifyLabel
        : verifyLabel;

  const showFailureNotice = Boolean(failureKey) && !failureNoticeDismissed;

  const dismissBtn = (
    <TouchableOpacity
      onPress={() => setFailureNoticeDismissed(true)}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel="Dismiss failure reason"
      style={styles.noticeDismissBtn}
    >
      <Ionicons name="close" size={18} color="#64748b" />
    </TouchableOpacity>
  );

  const applyPickedDate = (selected: Date) => {
    onDobChange?.(dateToYmd(selected));
  };

  return (
    <View style={styles.card}>
      {requiresDob ? (
        <View style={styles.dobBlock}>
          <Text style={styles.dobLabel}>Date of Birth</Text>
          <Pressable
            onPress={() => {
              if (!pickerDisabled) setShowDatePicker(true);
            }}
            disabled={pickerDisabled}
            style={[
              styles.dobPressable,
              !dobOk && styles.dobInputError,
              pickerDisabled && styles.dobPressableDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Select date of birth"
          >
            <Text style={[styles.dobText, !dobYmd && styles.dobPlaceholder]}>
              {dobYmd ? formatDobDisplay(dobYmd) : "DD/MM/YYYY"}
            </Text>
            <Ionicons name="calendar-outline" size={20} color="#64748b" />
          </Pressable>

          {showDatePicker && DateTimePicker ? (
            <DateTimePicker
              value={dobDate || new Date(2000, 0, 1)}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(event, selectedDate) => {
                if (Platform.OS === "android") {
                  setShowDatePicker(false);
                }
                if (event?.type === "dismissed") {
                  setShowDatePicker(false);
                  return;
                }
                if (selectedDate) {
                  applyPickedDate(selectedDate);
                }
              }}
              maximumDate={new Date()}
              minimumDate={new Date(new Date().setFullYear(new Date().getFullYear() - 100))}
            />
          ) : null}

          {Platform.OS === "ios" && showDatePicker && DateTimePicker ? (
            <TouchableOpacity
              onPress={() => setShowDatePicker(false)}
              style={styles.dateApplyBtn}
              accessibilityRole="button"
              accessibilityLabel="Apply date"
            >
              <Text style={styles.dateApplyBtnText}>Apply</Text>
            </TouchableOpacity>
          ) : null}

          {!DateTimePicker ? (
            <Text style={styles.dobHint}>
              Date picker unavailable. Complete Aadhaar so DOB can be prefilled.
            </Text>
          ) : (
            <Text style={styles.dobHint}>
              Same as Cashfree — pick DOB printed on your driving licence.
            </Text>
          )}
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, verifyDisabled && styles.buttonDisabled]}
        disabled={verifyDisabled}
        onPress={onVerify}
        activeOpacity={0.8}
      >
        {state.phase === "verifying" ? (
          <ActivityIndicator size="small" color="#7cb889" />
        ) : (
          <Ionicons name="flash" size={16} color={verifyDisabled ? "#7cb889" : "#fff"} />
        )}
        <Text style={[styles.buttonText, verifyDisabled && styles.buttonTextDisabled]}>
          {buttonLabel}
        </Text>
      </TouchableOpacity>

      {showFailureNotice && state.phase === "mismatch" ? (
        <View style={[styles.notice, styles.noticeWarn]}>
          <Ionicons name="alert-circle" size={16} color="#b45309" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.noticeWarnTitle}>Auto Verification Failed – Data Mismatch</Text>
            <Text style={styles.noticeWarnReason}>Reason: {state.error}</Text>
            <Text style={styles.noticeWarnText}>
              Upload a clear photo of the original document below. Our team will review it manually
              — onboarding can continue.
            </Text>
          </View>
          {dismissBtn}
        </View>
      ) : null}

      {showFailureNotice && state.phase === "failed" && mode === "auto" ? (
        <View style={[styles.notice, styles.noticeError]}>
          <Ionicons name="close-circle" size={16} color="#be123c" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.noticeErrorTitle}>Auto Verification Failed</Text>
            <Text style={styles.noticeErrorReason}>Reason: {state.error}</Text>
            {state.providerReference ? (
              <Text style={styles.noticeErrorText}>
                Cashfree Ref: {state.providerReference}
                {state.verificationId ? ` · ID: ${state.verificationId}` : ""}
              </Text>
            ) : null}
            <Text style={styles.noticeErrorText}>
              Please re-check the {documentLabel} number and date of birth, then try again.
            </Text>
          </View>
          {dismissBtn}
        </View>
      ) : null}
      {showFailureNotice && state.phase === "failed" && mode === "hybrid" ? (
        <View style={[styles.notice, styles.noticeWarn]}>
          <Ionicons name="alert-circle" size={16} color="#b45309" />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.noticeWarnTitle}>Auto Verification Failed</Text>
            <Text style={styles.noticeWarnReason}>Reason: {state.error}</Text>
            {state.providerReference ? (
              <Text style={styles.noticeWarnText}>
                Cashfree Ref: {state.providerReference}
                {state.verificationId ? ` · ID: ${state.verificationId}` : ""}
              </Text>
            ) : null}
            <Text style={styles.noticeWarnText}>
              Check licence number + DOB (as on DL), or upload a clear photo for manual review.
            </Text>
          </View>
          {dismissBtn}
        </View>
      ) : null}
      {state.phase === "manual" ? (
        <View style={[styles.notice, styles.noticeInfo]}>
          <Ionicons name="time" size={16} color="#4f46e5" />
          <Text style={styles.noticeInfoText}>
            Queued for manual verification. Upload the document photo to continue.
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
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 2,
  },
  detailLabel: { fontSize: 12, color: "#64748b", flexShrink: 0, maxWidth: "42%" },
  detailValue: { fontSize: 12, fontWeight: "600", color: "#0f172a", flex: 1, textAlign: "right" },
  verifiedHint: { marginTop: 6, fontSize: 12, color: "#047857" },
  dobBlock: { gap: 6 },
  dobLabel: { fontSize: 13, fontWeight: "500", color: "#64748b" },
  dobPressable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 11,
    backgroundColor: "#fff",
    minHeight: 44,
  },
  dobPressableDisabled: { opacity: 0.6 },
  dobText: { flex: 1, fontSize: 15, fontWeight: "500", color: "#0f172a" },
  dobPlaceholder: { color: "#94a3b8", fontWeight: "400" },
  dobInputError: { borderColor: "#f87171" },
  dateApplyBtn: {
    alignSelf: "flex-end",
    backgroundColor: "#6366f1",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dateApplyBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  dobHint: { fontSize: 11, color: "#64748b", lineHeight: 15 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    backgroundColor: "#edf8f0",
    borderWidth: 1.5,
    borderColor: "rgba(57, 211, 83, 0.25)",
    opacity: 1,
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  buttonTextDisabled: { color: "#7cb889" },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 10,
  },
  noticeDismissBtn: {
    marginTop: -2,
    marginRight: -2,
    padding: 2,
  },
  noticeError: { backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },
  noticeWarn: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a" },
  noticeInfo: { backgroundColor: "#eef2ff", borderWidth: 1, borderColor: "#c7d2fe" },
  noticeErrorTitle: { fontSize: 12, fontWeight: "700", color: "#9f1239" },
  noticeErrorReason: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "700", color: "#9f1239" },
  noticeErrorText: { flex: 1, fontSize: 12, lineHeight: 17, color: "#9f1239" },
  noticeWarnTitle: { fontSize: 12, fontWeight: "700", color: "#92400e" },
  noticeWarnReason: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "700", color: "#92400e" },
  noticeWarnText: { flex: 1, fontSize: 12, lineHeight: 17, color: "#92400e" },
  noticeInfoText: { flex: 1, fontSize: 12, lineHeight: 17, color: "#3730a3" },
});
