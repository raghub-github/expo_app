/**
 * Email verification – send OTP to email and confirm.
 * Placeholder: UI ready; backend send/confirm can be wired later.
 */

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

const TEAL = "#14b8a6";
const TITLE = "#1A1A1A";
const GRAY = "#6B7280";

export default function VerifyEmailScreen() {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);

  const handleSendCode = () => {
    setSent(true);
  };

  const handleVerify = () => {
    // TODO: call POST /v1/me/confirm-email-verification { code }
  };

  return (
    <View style={[styles.container, { paddingTop: 16, paddingBottom: insets.bottom }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="mail-open-outline" size={48} color={TEAL} />
      </View>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.subtitle}>
        {sent
          ? "Enter the 6-digit code we sent to your email."
          : "We'll send a verification code to your registered email."}
      </Text>
      {!sent ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={handleSendCode}>
          <Text style={styles.primaryBtnText}>Send code</Text>
        </TouchableOpacity>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Enter 6-digit code"
            placeholderTextColor={GRAY}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, code.length < 6 && styles.primaryBtnDisabled]}
            onPress={handleVerify}
            disabled={code.length < 6}
          >
            <Text style={styles.primaryBtnText}>Verify</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F0F4F3", paddingHorizontal: 24 },
  iconWrap: { alignItems: "center", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: "700", color: TITLE, textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 15, color: GRAY, textAlign: "center", marginBottom: 24 },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    marginBottom: 16,
    letterSpacing: 4,
  },
  primaryBtn: {
    backgroundColor: TEAL,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
