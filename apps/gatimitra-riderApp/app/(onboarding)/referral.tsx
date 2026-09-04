/**
 * Post-OTP referral prompt — shown only when Super Admin "Rider Referral"
 * (rider_referral_enabled) is ON. Otherwise this screen immediately forwards
 * to Aadhaar so new riders never see a dead-end.
 *
 * Code entry requires an explicit Verify step (preview API). Continue is
 * enabled only after a successful verify — invalid codes never advance.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { colors } from "@/src/theme";
import { goBackFromOnboardingEntry } from "@/src/lib/onboarding-navigation";
import { peekPendingReferral, storePendingReferral } from "@/src/lib/pendingReferral";
import {
  applyRiderReferral,
  fetchRiderReferralConfig,
  previewRiderReferral,
} from "@/src/services/referral.service";
import { userMessageForReferralApplyError } from "@/src/lib/referralCopy";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";

type Phase = "loading" | "choice" | "code";

export default function OnboardingReferralScreen() {
  const setData = useOnboardingStore((s) => s.setData);

  const [phase, setPhase] = useState<Phase>("loading");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [applying, setApplying] = useState(false);
  /** Canonical code returned by preview — Continue only works when this is set. */
  const [verifiedCode, setVerifiedCode] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  const busy = verifying || applying;
  const codeReady = code.trim().length >= 3;
  const isVerified = verifiedCode != null && verifiedCode === code.trim().toUpperCase();

  const runBootstrap = useCallback(async () => {
    setBootError(null);
    setPhase("loading");
    const config = await fetchRiderReferralConfig().catch(() => null);

    // Network / API failure — do NOT mark prompt handled (that permanently skipped
    // referral even when Super Admin Rider Referral was ON).
    if (!config) {
      setBootError("Could not load referral settings. Check your connection and try again.");
      setPhase("choice");
      return;
    }

    // Confirmed OFF in dashboard — skip prompt for this rider.
    if (config.referralEnabled !== true) {
      await setData({ referralPromptHandled: true, skippedReferral: true });
      router.replace("/(onboarding)/aadhaar");
      return;
    }

    const pending = await peekPendingReferral().catch(() => null);
    if (pending?.code) {
      setCode(pending.code);
      setPhase("code");
      return;
    }
    setPhase("choice");
  }, [setData]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void runBootstrap();
  }, [runBootstrap]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (phase === "code") {
        setPhase("choice");
        setError(null);
        setVerifiedCode(null);
        return true;
      }
      // Logged-in: stay on this first onboarding step (never force re-login).
      goBackFromOnboardingEntry();
      return true;
    });
    return () => sub.remove();
  }, [phase]);

  const onWithoutReferral = useCallback(async () => {
    if (busy) return;
    setApplying(true);
    setError(null);
    try {
      await setData({
        referralPromptHandled: true,
        skippedReferral: true,
        referralCode: undefined,
      });
      router.replace("/(onboarding)/aadhaar");
    } catch {
      setApplying(false);
    }
  }, [busy, setData]);

  const onWithReferral = useCallback(() => {
    if (busy) return;
    setError(null);
    setVerifiedCode(null);
    setPhase("code");
  }, [busy]);

  const onCodeChange = (raw: string) => {
    const next = raw.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase().slice(0, 32);
    setCode(next);
    setError(null);
    // Any edit invalidates a previous verify — must verify again.
    setVerifiedCode(null);
  };

  /** Step 1 — validate with backend preview. Does NOT apply / advance. */
  const onVerifyCode = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 3) {
      setError("Invalid referral code");
      setVerifiedCode(null);
      return;
    }
    if (busy) return;
    setVerifying(true);
    setError(null);
    setVerifiedCode(null);
    try {
      const preview = await previewRiderReferral(trimmed);
      if (!preview.ok || preview.valid === false) {
        setError("Invalid referral code");
        setVerifiedCode(null);
        return;
      }
      const finalCode = (preview.code || trimmed).trim().toUpperCase();
      setCode(finalCode);
      setVerifiedCode(finalCode);
      setError(null);
    } catch {
      setError("Invalid referral code");
      setVerifiedCode(null);
    } finally {
      setVerifying(false);
    }
  };

  /** Step 2 — only after verify. Applies code, then opens Aadhaar. */
  const onContinueWithVerified = async () => {
    if (!isVerified || !verifiedCode) {
      setError("Please verify your referral code first");
      return;
    }
    if (busy) return;
    setApplying(true);
    setError(null);
    try {
      const applied = await applyRiderReferral({
        referralCode: verifiedCode,
        source: "manual",
      });

      if (applied.ok || applied.alreadyApplied) {
        await setData({
          referralPromptHandled: true,
          skippedReferral: false,
          referralCode: verifiedCode,
        });
        router.replace("/(onboarding)/aadhaar");
        return;
      }

      if (applied.error === "REFERRAL_SERVICE_DISABLED") {
        await setData({
          referralPromptHandled: true,
          skippedReferral: true,
          referralCode: undefined,
        });
        router.replace("/(onboarding)/aadhaar");
        return;
      }

      // Verified but apply failed transiently — keep for resume, still don't pretend success.
      await storePendingReferral({ code: verifiedCode, source: "manual" });
      setError(userMessageForReferralApplyError(applied.error));
      setApplying(false);
    } catch {
      setError(userMessageForReferralApplyError("apply_failed"));
      setApplying(false);
    }
  };

  const onBack = () => {
    if (phase === "code") {
      setPhase("choice");
      setError(null);
      setVerifiedCode(null);
      return;
    }
    // Logged-in riders must not be sent to login for re-OTP.
    goBackFromOnboardingEntry();
  };

  if (phase === "loading") {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={ACCENT_DARK} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={onBack}
              style={styles.backBtn}
              activeOpacity={0.85}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={22} color={colors.gray[800]} />
            </TouchableOpacity>
          </View>

          {phase === "choice" ? (
            <View style={styles.choiceScreen}>
              <View style={styles.headerBlock}>
                <LinearGradient
                  colors={["#c8f5d0", "#39d353"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroOrb}
                >
                  <Ionicons name="gift" size={32} color="#ffffff" />
                </LinearGradient>
                <View style={styles.stepPill}>
                  <Ionicons name="gift-outline" size={14} color={ACCENT_DARK} />
                  <Text style={styles.stepPillText}>Referral</Text>
                </View>
                <Text style={styles.title}>Got a referral?</Text>
                <Text style={styles.subtitle}>
                  If a partner invited you, continue with their code. Otherwise continue without a
                  referral.
                </Text>
              </View>

              {bootError ? (
                <View style={styles.bootErrorBox}>
                  <Text style={styles.bootErrorText}>{bootError}</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      void runBootstrap();
                    }}
                    style={styles.primaryBtn}
                  >
                    <Text style={styles.primaryBtnText}>Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      void onWithoutReferral();
                    }}
                    style={styles.secondaryBtn}
                  >
                    <Text style={styles.secondaryBtnText}>Continue without referral</Text>
                    <Ionicons name="arrow-forward" size={18} color={ACCENT_DARK} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.buttonsCenter}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={onWithReferral}
                    disabled={busy}
                    accessibilityRole="button"
                    style={[styles.primaryBtn, busy ? styles.btnDisabled : null]}
                  >
                    <Ionicons name="gift-outline" size={20} color="#ffffff" />
                    <Text style={styles.primaryBtnText}>Continue with referral</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      void onWithoutReferral();
                    }}
                    disabled={busy}
                    accessibilityRole="button"
                    style={[styles.secondaryBtn, busy ? styles.btnDisabled : null]}
                  >
                    {busy ? (
                      <ActivityIndicator color={ACCENT_DARK} />
                    ) : (
                      <>
                        <Text style={styles.secondaryBtnText}>Continue without referral</Text>
                        <Ionicons name="arrow-forward" size={18} color={ACCENT_DARK} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.codeScroll}
              keyboardShouldPersistTaps="always"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.headerBlock}>
                <LinearGradient
                  colors={["#c8f5d0", "#39d353"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroOrb}
                >
                  <Ionicons name="ticket-outline" size={30} color="#ffffff" />
                </LinearGradient>
                <View style={styles.stepPill}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={ACCENT_DARK} />
                  <Text style={styles.stepPillText}>Verify code</Text>
                </View>
                <Text style={styles.title}>Enter referral code</Text>
                <Text style={styles.subtitle}>
                  Verify your code first. Only a valid referral can be used to continue.
                </Text>
              </View>

              <View style={styles.codeBody}>
                <Text style={styles.fieldLabel}>
                  Referral code <Text style={styles.requiredMark}>*</Text>
                </Text>
                <View
                  style={[
                    styles.inputWrap,
                    error ? styles.inputErrorBorder : null,
                    isVerified ? styles.inputSuccessBorder : null,
                  ]}
                >
                  <Ionicons
                    name="pricetag-outline"
                    size={20}
                    color={error ? colors.error[500] : isVerified ? ACCENT_DARK : colors.gray[400]}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    value={code}
                    onChangeText={onCodeChange}
                    placeholder="e.g. GMRIDER123"
                    placeholderTextColor={colors.gray[400]}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={32}
                    editable={!busy}
                    style={styles.inputWithIcon}
                  />
                  {isVerified ? (
                    <Ionicons name="checkmark-circle" size={22} color={ACCENT_DARK} />
                  ) : null}
                </View>

                {error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="close-circle" size={18} color={colors.error[500]} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {isVerified ? (
                  <View style={styles.successBanner}>
                    <Ionicons name="checkmark-circle" size={18} color={ACCENT_DARK} />
                    <Text style={styles.successText}>Referral code verified</Text>
                  </View>
                ) : null}

                {/* Step 1: Verify — required before Continue */}
                {!isVerified ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      void onVerifyCode();
                    }}
                    disabled={busy || !codeReady}
                    accessibilityRole="button"
                    accessibilityLabel="Verify referral code"
                    style={[
                      styles.primaryBtn,
                      !codeReady || busy ? styles.primaryBtnDisabled : null,
                    ]}
                  >
                    {verifying ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons
                          name="shield-checkmark-outline"
                          size={20}
                          color={!codeReady ? "#7cb889" : "#ffffff"}
                        />
                        <Text
                          style={[
                            styles.primaryBtnText,
                            !codeReady ? styles.primaryBtnTextDisabled : null,
                          ]}
                        >
                          Verify code
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      void onContinueWithVerified();
                    }}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Continue"
                    style={[styles.primaryBtn, busy ? styles.btnDisabled : null]}
                  >
                    {applying ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <>
                        <Text style={styles.primaryBtnText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                      </>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    void onWithoutReferral();
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>Continue without referral</Text>
                  <Ionicons name="arrow-forward" size={18} color={ACCENT_DARK} />
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  safeArea: {
    flex: 1,
    backgroundColor: BG,
  },
  flex: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  choiceScreen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  headerBlock: {
    alignItems: "center",
    paddingTop: 8,
  },
  heroOrb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT_DARK,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  buttonsCenter: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "stretch",
    paddingBottom: 40,
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.25)",
    marginBottom: 12,
  },
  stepPillText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: "600",
    color: ACCENT_DARK,
  },
  title: {
    fontFamily: "Lora_700Bold",
    fontSize: 24,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
    textAlign: "center",
    maxWidth: 320,
    paddingHorizontal: 8,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
    marginBottom: 14,
    width: "100%",
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginLeft: 10,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
    width: "100%",
    borderWidth: 2,
    borderColor: ACCENT_DARK,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: ACCENT_DARK,
    marginRight: 8,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  bootErrorBox: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    paddingBottom: 40,
  },
  bootErrorText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.error[600],
    textAlign: "center",
    marginBottom: 16,
    fontWeight: "600",
  },
  codeScroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  codeBody: {
    marginTop: 28,
    width: "100%",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[700],
    marginBottom: 8,
  },
  requiredMark: {
    color: colors.error[500],
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 54,
    marginBottom: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  inputWithIcon: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.gray[900],
    letterSpacing: 1,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
  },
  inputErrorBorder: {
    borderColor: colors.error[400],
    backgroundColor: colors.error[50],
  },
  inputSuccessBorder: {
    borderColor: ACCENT_DARK,
    backgroundColor: "#f0fdf4",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 14,
    backgroundColor: colors.error[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  errorText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
    color: colors.error[600],
    lineHeight: 18,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    marginBottom: 14,
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(34, 167, 69, 0.35)",
  },
  successText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
    color: ACCENT_DARK,
  },
  primaryBtnDisabled: {
    backgroundColor: "#edf8f0",
    borderWidth: 1.5,
    borderColor: "rgba(57, 211, 83, 0.25)",
  },
  primaryBtnTextDisabled: {
    color: "#7cb889",
  },
});
