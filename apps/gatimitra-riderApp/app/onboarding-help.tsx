// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
/**
 * Onboarding "Need help / Raise a ticket" screen.
 *
 * Reached from the three-dot menu on any onboarding step. Creates a rider-source ticket titled
 * ONBOARDING_ISSUE (NON_ORDER_RELATED) pre-filled with the rider's name + phone + the step they
 * were on, plus whatever they type. Uses the same unified-tickets pipeline as every other rider
 * ticket (riderSupportService.createTicketWithPhotos → POST /rider-support/tickets).
 */
import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import { colors } from "@/src/theme";
import { riderSupportService } from "@/src/services/riderSupport.service";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { onboardingStepMetaForRoute } from "@/src/lib/onboarding-routes";
import { extractApiErrorMessage } from "@/src/services/http";

const BRAND = colors.primary[600];
const MAX_CHARS = 1000;
const MIN_CHARS = 3;

function paramString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

export default function OnboardingHelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ step?: string }>();

  const profile = useRiderProfile();
  const onboardingName = useOnboardingStore((s) => s.data.fullName);

  const stepMeta = useMemo(
    () => onboardingStepMetaForRoute(paramString(params.step) ?? ""),
    [params.step]
  );

  const riderName = (profile.data?.name || onboardingName || "").trim();
  const riderPhone = (profile.data?.mobile || "").trim();

  const [detail, setDetail] = useState("");

  const stepLine =
    stepMeta.number != null
      ? `Step ${stepMeta.number} of ${stepMeta.total} — ${stepMeta.label}`
      : stepMeta.label;

  const subject = useMemo(
    () =>
      stepMeta.number != null
        ? `Rider onboarding help — ${stepMeta.label} (step ${stepMeta.number})`
        : `Rider onboarding help — ${stepMeta.label}`,
    [stepMeta]
  );

  const canSubmit = detail.trim().length >= MIN_CHARS && !profile.isLoading;

  const createMutation = useMutation({
    mutationFn: async () => {
      // Rich, self-describing description so an agent has full context without opening the app.
      const lines = [
        "Rider onboarding support request.",
        riderName ? `Name: ${riderName}` : "Name: (not provided yet)",
        riderPhone ? `Phone: ${riderPhone}` : "Phone: (unavailable)",
        `Onboarding step: ${stepLine}`,
        "",
        "Issue described by rider:",
        detail.trim(),
      ];
      return riderSupportService.createTicketWithPhotos({
        title_code: "ONBOARDING_ISSUE",
        subject,
        description: lines.join("\n"),
      });
    },
    onSuccess: () => {
      Alert.alert(
        "Ticket raised",
        "Our team will reach out to help you finish onboarding. You can track it under My Tickets.",
        [
          { text: "View my tickets", onPress: () => router.replace("/my-tickets") },
          { text: "Back to onboarding", style: "cancel", onPress: () => router.back() },
        ]
      );
    },
    onError: (err) => {
      Alert.alert("Could not raise ticket", extractApiErrorMessage(err, "Please try again."));
    },
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Need help?
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>
            Stuck during onboarding? Raise a ticket and our team will help you.
          </Text>

          <View style={styles.contextCard}>
            <ContextRow icon="person-outline" label="Name" value={riderName || "—"} />
            <ContextRow icon="call-outline" label="Phone" value={riderPhone || "—"} />
            <ContextRow icon="footsteps-outline" label="Onboarding step" value={stepLine} />
          </View>

          <Text style={styles.fieldLabel}>What went wrong?</Text>
          <TextInput
            style={styles.input}
            value={detail}
            onChangeText={(v) => setDetail(v.slice(0, MAX_CHARS))}
            placeholder="Describe the issue you're facing (e.g. document upload keeps failing)…"
            placeholderTextColor="#94A3B8"
            multiline
            textAlignVertical="top"
            editable={!createMutation.isPending}
          />
          <Text style={styles.counter}>
            {detail.length}/{MAX_CHARS}
          </Text>

          <Pressable
            onPress={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            style={[styles.submitBtn, (!canSubmit || createMutation.isPending) && styles.submitBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Raise ticket"
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Raise ticket</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ContextRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={styles.ctxRow}>
      <Ionicons name={icon} size={16} color={BRAND} style={{ width: 22 }} />
      <Text style={styles.ctxLabel}>{label}</Text>
      <Text style={styles.ctxValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F4FBF6" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  lead: { fontSize: 14, color: "#475569", lineHeight: 20, marginBottom: 14 },
  contextCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 10,
    marginBottom: 18,
  },
  ctxRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ctxLabel: { fontSize: 13, color: "#64748B", width: 108 },
  ctxValue: { fontSize: 13, color: "#0F172A", fontWeight: "600", flex: 1 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: "#0F172A", marginBottom: 8 },
  input: {
    minHeight: 130,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    padding: 12,
    fontSize: 14,
    color: "#0F172A",
  },
  counter: { alignSelf: "flex-end", fontSize: 11, color: "#94A3B8", marginTop: 4 },
  submitBtn: {
    marginTop: 18,
    backgroundColor: BRAND,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
