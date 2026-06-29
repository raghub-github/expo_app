/**
 * Account deletion — request screen.
 *
 * Deletion is request → review → deactivation (data retained, no revive).
 * The customer picks a reason and submits; the backend records a review row
 * and deactivates the account. We then sign the user out. There is no instant
 * self-service wipe and no way to reopen a closed account.
 *
 * Endpoint: POST /v1/me/account/deletion-request
 * Policy:   Profile → Settings → Privacy → Account Deletion Policy
 */

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/store/authStore";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { ProfileTheme } from "@/constants/profileTheme";
import api from "@/services/api";

const { green: GREEN, greenDark: GREEN_DARK, text: TEXT, muted: MUTED, border: BORDER, pageBg: PAGE_BG } =
  ProfileTheme;
const DANGER = "#DC2626";

const REASONS: { code: string; label: string }[] = [
  { code: "not_using", label: "I no longer use GatiMitra" },
  { code: "privacy", label: "Privacy concerns" },
  { code: "duplicate", label: "I created a duplicate account" },
  { code: "bad_experience", label: "Poor experience / service issues" },
  { code: "too_many_notifications", label: "Too many notifications / messages" },
  { code: "other", label: "Other" },
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const logout = useAuthStore((s) => s.logout);

  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!reasonCode && acknowledged && !submitting;

  const submitRequest = async () => {
    setConfirmVisible(false);
    setSubmitting(true);
    try {
      await api.post(
        "/v1/me/account/deletion-request",
        {
          reasonCode,
          reason: details.trim() || REASONS.find((r) => r.code === reasonCode)?.label || null,
        },
        { headers: { "X-Deletion-Source": "app" }, timeout: 15000 },
      );
      await logout();
      Alert.alert(
        "Request submitted",
        "Your account deletion request has been received and your account has been deactivated. This action is permanent — a closed account cannot be reopened.",
        [{ text: "OK", onPress: () => router.replace("/") }],
      );
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { message?: string; error?: string } } };
      const msg =
        ax?.response?.data?.message ||
        ax?.response?.data?.error ||
        "Could not submit your request. Please try again or email grievance@gatimitra.com.";
      Alert.alert("Something went wrong", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor="#fff" />
      <ProfileSubpageHeader title="Delete my account" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Warning banner */}
        <View style={styles.warnCard}>
          <Ionicons name="warning-outline" size={22} color={DANGER} />
          <Text style={styles.warnText}>
            Deleting your account is <Text style={styles.bold}>permanent</Text>. Once your request is
            reviewed and the account is deactivated, it <Text style={styles.bold}>cannot be reopened</Text>
            . Your order history, wallet balance and GMitra Max benefits cannot be recovered.
          </Text>
        </View>

        {/* How it works */}
        <Text style={styles.sectionTitle}>How it works</Text>
        <View style={styles.card}>
          <Step n="1" title="You raise a request" body="Choose a reason below and submit." />
          <View style={styles.separator} />
          <Step
            n="2"
            title="We review it"
            body="We verify it's you and settle any pending orders, rides or refunds (usually within 7 days)."
          />
          <View style={styles.separator} />
          <Step
            n="3"
            title="Account is deactivated"
            body="Login is blocked and the account is closed for good."
          />
        </View>

        {/* What we keep */}
        <Text style={styles.sectionTitle}>What happens to your data</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="trash-outline" size={18} color={GREEN_DARK} style={styles.infoIcon} />
            <Text style={styles.infoText}>
              Profile photo, saved addresses, cart, wishlist and marketing data are removed within 30 days.
            </Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.infoRow}>
            <Ionicons name="lock-closed-outline" size={18} color={GREEN_DARK} style={styles.infoIcon} />
            <Text style={styles.infoText}>
              Your name, registered mobile number, documents and invoices are{" "}
              <Text style={styles.bold}>retained</Text> for the periods Indian law requires (tax, GST,
              KYC), kept isolated from active systems, then permanently purged.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push("/profile/legal/data-deletion-policy" as never)}
          activeOpacity={0.7}
          style={styles.policyLink}
        >
          <Ionicons name="document-text-outline" size={15} color={GREEN_DARK} />
          <Text style={styles.policyLinkText}>Read the full Account Deletion Policy</Text>
        </TouchableOpacity>

        {/* Reason */}
        <Text style={styles.sectionTitle}>Why are you leaving?</Text>
        <View style={styles.card}>
          {REASONS.map((r, idx) => (
            <View key={r.code}>
              {idx > 0 && <View style={styles.separator} />}
              <TouchableOpacity
                style={styles.reasonRow}
                activeOpacity={0.7}
                onPress={() => setReasonCode(r.code)}
              >
                <Ionicons
                  name={reasonCode === r.code ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={reasonCode === r.code ? GREEN_DARK : "#C4C4C4"}
                />
                <Text style={styles.reasonLabel}>{r.label}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Tell us more (optional)"
          placeholderTextColor={MUTED}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={1000}
        />

        {/* Acknowledge */}
        <TouchableOpacity
          style={styles.ackRow}
          activeOpacity={0.7}
          onPress={() => setAcknowledged((v) => !v)}
        >
          <Ionicons
            name={acknowledged ? "checkbox" : "square-outline"}
            size={22}
            color={acknowledged ? DANGER : "#C4C4C4"}
          />
          <Text style={styles.ackText}>
            I understand this is permanent and my account cannot be revived.
          </Text>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          activeOpacity={0.85}
          disabled={!canSubmit}
          onPress={() => setConfirmVisible(true)}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Request account deletion</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} activeOpacity={0.7} onPress={() => router.back()}>
          <Text style={styles.cancelText}>Keep my account</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Final confirmation */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setConfirmVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalIconWrap}>
              <Ionicons name="trash-outline" size={26} color="#fff" />
            </View>
            <Text style={styles.modalTitle}>Delete account?</Text>
            <Text style={styles.modalMessage}>
              This submits a deletion request and deactivates your account. It cannot be undone.
            </Text>
            <TouchableOpacity style={styles.modalDeleteBtn} onPress={submitRequest} activeOpacity={0.85}>
              <Text style={styles.modalDeleteText}>Yes, delete my account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setConfirmVisible(false)} activeOpacity={0.8}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  warnCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 14,
    padding: 14,
  },
  warnText: { flex: 1, fontSize: 13, lineHeight: 19, color: "#7F1D1D" },
  bold: { fontWeight: "800" },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    marginTop: 20,
    marginBottom: 10,
    marginLeft: 2,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  rowTextWrap: { flex: 1, minWidth: 0 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginLeft: 14 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ProfileTheme.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontSize: 13, fontWeight: "800", color: GREEN_DARK },
  stepTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  stepBody: { fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 18 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 10 },
  infoIcon: { marginTop: 1 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 19, color: TEXT },
  policyLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingLeft: 2 },
  policyLinkText: { fontSize: 13, fontWeight: "600", color: GREEN_DARK, textDecorationLine: "underline" },
  reasonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  reasonLabel: { flex: 1, fontSize: 14.5, color: TEXT, fontWeight: "500" },
  input: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    minHeight: 90,
    textAlignVertical: "top",
    fontSize: 14,
    color: TEXT,
    marginTop: 12,
  },
  ackRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, paddingHorizontal: 2 },
  ackText: { flex: 1, fontSize: 13.5, color: TEXT, lineHeight: 19 },
  submitBtn: {
    marginTop: 20,
    backgroundColor: DANGER,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: { backgroundColor: "#FCA5A5" },
  submitText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  cancelBtn: { marginTop: 10, paddingVertical: 13, alignItems: "center" },
  cancelText: { fontSize: 15, fontWeight: "700", color: GREEN_DARK },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: DANGER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: TEXT, marginBottom: 8 },
  modalMessage: { fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 20, marginBottom: 20 },
  modalDeleteBtn: {
    width: "100%",
    backgroundColor: DANGER,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalDeleteText: { fontSize: 15, fontWeight: "800", color: "#fff" },
  modalCancelBtn: { width: "100%", paddingVertical: 13, alignItems: "center", marginTop: 6 },
  modalCancelText: { fontSize: 15, fontWeight: "700", color: MUTED },
});
