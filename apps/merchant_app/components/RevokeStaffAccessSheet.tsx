/**
 * Staff/manager self-revoke: OTP to their phone → delete store_staff + kick sessions.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";
import {
  sendMerchantActionOtp,
  selfRevokeStaffAccess,
} from "@/services/staffApi";

type Props = {
  visible: boolean;
  token: string | null;
  onClose: () => void;
  /** After successful revoke — clear local session. */
  onRevoked: () => void | Promise<void>;
};

export function RevokeStaffAccessSheet({ visible, token, onClose, onRevoked }: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const requestIdRef = useRef<string | null>(null);
  const [digits, setDigits] = useState("");
  const [maskedLine, setMaskedLine] = useState("");
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendSec, setResendSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = useCallback(async () => {
    if (!token) return;
    setSending(true);
    setError(null);
    setDevOtpHint(null);
    try {
      const sent = await sendMerchantActionOtp(token, "self_revoke");
      requestIdRef.current = sent.requestId;
      const channels = [sent.maskedPhone, sent.maskedEmail].filter(Boolean).join(" or ");
      setMaskedLine(
        channels ? `Enter the OTP sent on ${channels}` : "Enter the OTP sent to your phone"
      );
      if (typeof sent.devOtp === "string" && sent.devOtp.length === 6) {
        setDevOtpHint(sent.devOtp);
        setDigits(sent.devOtp);
      }
      setResendSec(30);
      setTimeout(() => inputRef.current?.focus(), 250);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send OTP.");
    } finally {
      setSending(false);
    }
  }, [token]);

  useEffect(() => {
    if (!visible) {
      setDigits("");
      setError(null);
      setMaskedLine("");
      setDevOtpHint(null);
      requestIdRef.current = null;
      setResendSec(0);
      return;
    }
    void sendOtp();
  }, [visible, sendOtp]);

  useEffect(() => {
    if (resendSec <= 0) return;
    const t = setTimeout(() => setResendSec((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSec]);

  const onContinue = async () => {
    if (!token || digits.length !== 6 || !requestIdRef.current || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      await selfRevokeStaffAccess(token, {
        requestId: requestIdRef.current,
        otp: digits,
      });
      onClose();
      await onRevoked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke access.");
    } finally {
      setVerifying(false);
    }
  };

  const ready = digits.length === 6 && !verifying && !sending;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {}}>
      <View style={styles.root}>
        {/* Backdrop is non-dismissible — only the X button closes the OTP sheet. */}
        <View style={styles.dim} pointerEvents="auto" />
        <View style={styles.closeFloat}>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <Text style={styles.title}>Revoke staff access</Text>
          <Text style={styles.body}>
            This permanently removes you from this outlet staff list. Enter the OTP sent to your
            phone to confirm.
          </Text>
          {maskedLine ? <Text style={styles.masked}>{maskedLine}</Text> : null}
          {devOtpHint ? (
            <Text style={styles.devOtp}>
              Dev OTP (SMS gateway not delivering): {devOtpHint}
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.boxes} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.box}>
                <Text style={styles.digit}>{digits[i] ?? ""}</Text>
                <View style={styles.underline} />
              </View>
            ))}
            <TextInput
              ref={inputRef}
              value={digits}
              onChangeText={(t) => setDigits(t.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.hiddenInput}
              caretHidden
              autoFocus
            />
          </Pressable>

          <View style={styles.resendRow}>
            {resendSec > 0 ? (
              <Text style={styles.resendMuted}>Resend OTP in {resendSec} secs</Text>
            ) : (
              <Pressable onPress={() => void sendOtp()} disabled={sending}>
                <Text style={styles.resendActive}>{sending ? "Sending…" : "Resend OTP"}</Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={[styles.continueBtn, !ready && styles.continueBtnDisabled]}
            disabled={!ready}
            onPress={() => void onContinue()}
            accessibilityRole="button"
            accessibilityLabel="Confirm revoke staff access"
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.continueText}>Confirm & remove access</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  closeFloat: { alignItems: "center", marginBottom: 10 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 6,
  },
  masked: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  devOtp: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 1,
  },
  error: {
    fontSize: 13,
    color: GatiMitraMerchant.error,
    textAlign: "center",
    marginBottom: 8,
  },
  boxes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 10,
    position: "relative",
  },
  box: { width: 40, alignItems: "center" },
  digit: {
    color: GatiMitraMerchant.textPrimary,
    fontSize: 22,
    fontWeight: "700",
    minHeight: 28,
  },
  underline: {
    width: "100%",
    height: 2,
    backgroundColor: GatiMitraMerchant.border,
    marginTop: 4,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: "transparent",
  },
  resendRow: { alignItems: "flex-end", marginBottom: 16 },
  resendMuted: { color: GatiMitraMerchant.textTertiary, fontSize: 12 },
  resendActive: { color: GatiMitraMerchant.primary, fontSize: 12, fontWeight: "700" },
  continueBtn: {
    backgroundColor: GatiMitraMerchant.error,
    borderRadius: CARD_RADIUS,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  continueBtnDisabled: { opacity: 0.45 },
  continueText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
