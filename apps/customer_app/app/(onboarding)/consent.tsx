/**
 * Onboarding consent screen — Indian law requires explicit consent for
 * Terms + Privacy. Shown once at signup and again when LEGAL_PACK_VERSION
 * is bumped (handled at app root via a version gate).
 */

import { useState, useCallback } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, Alert, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { ONBOARDING_CONSENT_DOCS, LEGAL_PACK_VERSION } from "@/lib/legal-registry";
import { recordConsent } from "@/lib/legal-consent";
import { profileService } from "@/services/profile.service";
import { useScreenChromeStore } from "@/store/screenChromeStore";

const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F9FAFB";
const GREEN = "#16A34A";
const GREEN_DARK = "#15803D";

export default function ConsentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      useScreenChromeStore.setState({
        statusBarBackground: PAGE_BG,
        statusBarStyle: "dark",
        hideStatusBarSpacer: false,
        bootstrapActive: false,
      });
      return () => {
        useScreenChromeStore.getState().resetStatusBarBackground();
      };
    }, []),
  );

  const onAccept = async () => {
    if (!accepted || submitting) return;
    setSubmitting(true);
    try {
      await recordConsent({
        appVersion: Constants.expoConfig?.version ?? undefined,
      });

      try {
        const profile = await profileService.getProfile();
        if (profile?.profile_completed === true) {
          router.replace("/(tabs)/" as never);
          return;
        }
      } catch {
        /* fall through — treat as new user */
      }
      router.replace("/(onboarding)" as never);
    } catch (e) {
      Alert.alert(
        "Could not save consent",
        e instanceof Error ? e.message : "Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDecline = () => {
    Alert.alert(
      "Decline policies?",
      "You need to accept our Terms of Service and Privacy Policy to use GatiMitra. Without them, account creation isn't possible.",
      [
        { text: "Go back", style: "cancel" },
        {
          text: "Decline & exit",
          style: "destructive",
          onPress: () => router.replace("/(auth)/login" as never),
        },
      ]
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: 12 }]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 140 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="shield-checkmark" size={32} color="#FFFFFF" />
          </View>
          <AppText style={styles.heroTitle}>One quick step</AppText>
          <AppText style={styles.heroSub}>
            Indian law requires us to ask for your consent to our Terms of Service and Privacy Policy
            before you create an account.
          </AppText>
        </View>

        <View style={styles.policiesCard}>
          {ONBOARDING_CONSENT_DOCS.map((doc, idx) => (
            <View key={doc.id}>
              <TouchableOpacity
                style={styles.policyRow}
                activeOpacity={0.7}
                onPress={() => router.push(`/legal/${doc.id}` as never)}
              >
                <Ionicons
                  name={
                    doc.id === "terms-of-service"
                      ? "document-text-outline"
                      : "shield-checkmark-outline"
                  }
                  size={22}
                  color={GREEN_DARK}
                />
                <View style={styles.policyText}>
                  <AppText style={styles.policyTitle}>Read the {doc.title}</AppText>
                  <AppText style={styles.policySub}>{doc.subtitle}</AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={MUTED} />
              </TouchableOpacity>
              {idx < ONBOARDING_CONSENT_DOCS.length - 1 ? (
                <View style={styles.divider} />
              ) : null}
            </View>
          ))}
        </View>

        <Pressable
          style={styles.acceptBox}
          onPress={() => setAccepted((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          accessibilityLabel="I have read and agree to the Terms of Service and Privacy Policy"
          hitSlop={12}
          android_ripple={{ color: "rgba(22,163,74,0.12)", borderless: false }}
        >
          <View
            style={[styles.checkbox, accepted && styles.checkboxOn]}
            pointerEvents="none"
          >
            {accepted ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
          </View>
          <AppText style={styles.acceptText} pointerEvents="none">
            I have read and agree to the{" "}
            <AppText style={styles.acceptLink}>Terms of Service</AppText> and the{" "}
            <AppText style={styles.acceptLink}>Privacy Policy</AppText>. I confirm I am{" "}
            <AppText style={styles.bold}>18 years or older</AppText> to use ride services, or
            using GatiMitra under parental supervision.
          </AppText>
        </Pressable>

        <AppText style={styles.legalFooter}>
          You can change or withdraw consent at any time from{" "}
          <AppText style={styles.bold}>Profile → Settings → Privacy</AppText>. Updates to these
          policies trigger a re-consent prompt — no silent changes.
        </AppText>

        <AppText style={styles.versionTag}>Legal pack: {LEGAL_PACK_VERSION}</AppText>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity onPress={onDecline} style={styles.declineBtn} activeOpacity={0.8}>
          <AppText style={styles.declineText}>Decline</AppText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onAccept}
          disabled={!accepted || submitting}
          style={[styles.acceptBtn, (!accepted || submitting) && styles.acceptBtnDisabled]}
          activeOpacity={0.85}
        >
          <AppText style={styles.acceptBtnText}>{submitting ? "Saving…" : "Accept & continue"}</AppText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  hero: { alignItems: "center", marginTop: 8, marginBottom: 24, paddingHorizontal: 8 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: { fontSize: 22, fontWeight: "700", color: TEXT, marginBottom: 6 },
  heroSub: { fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 21 },
  policiesCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  policyText: { flex: 1 },
  policyTitle: { fontSize: 15, fontWeight: "600", color: TEXT },
  policySub: { fontSize: 12.5, color: MUTED, marginTop: 2 },
  divider: { height: 1, backgroundColor: BORDER, marginLeft: 48 },
  acceptBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginTop: 16,
    minHeight: 56,
    overflow: "hidden",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: GREEN, borderColor: GREEN },
  acceptText: { flex: 1, fontSize: 13.5, color: TEXT, lineHeight: 20 },
  acceptLink: { color: GREEN_DARK, fontWeight: "600", textDecorationLine: "underline" },
  bold: { fontWeight: "700" },
  legalFooter: { fontSize: 12, color: MUTED, marginTop: 14, lineHeight: 18, textAlign: "center" },
  versionTag: { fontSize: 11, color: MUTED, marginTop: 12, textAlign: "center" },
  cta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: PAGE_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
  },
  declineText: { fontSize: 15, fontWeight: "600", color: MUTED },
  acceptBtn: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: "center",
  },
  acceptBtnDisabled: { backgroundColor: "#9CA3AF" },
  acceptBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});
