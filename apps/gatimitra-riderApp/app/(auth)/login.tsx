import React, { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { createOtpService } from "@/src/services/auth/otp";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useCheckMobile, useCreateRider } from "@/src/hooks/useOnboarding";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";
import { Logo } from "@/src/components/Logo";

export default function LoginScreen() {
  const { t } = useTranslation();
  const { service } = useMemo(() => createOtpService(), []);
  const setSession = useSessionStore((s) => s.setSession);
  const checkMobile = useCheckMobile();
  const createRider = useCreateRider();
  const setOnboardingData = useOnboardingStore((s) => s.setData);

  const [phoneE164, setPhoneE164] = useState("");
  const [otp, setOtp] = useState("");
  const [displayedOtp, setDisplayedOtp] = useState<string | null>(null); // OTP to show to user
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Request OTP and display it to user
  const onRequestOtp = async () => {
    if (!phoneE164.trim() || phoneE164.trim().length < 10) {
      setError("Please enter a valid phone number");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Add timeout wrapper (20 seconds)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Request timeout. Please check your internet connection and try again.")), 20000);
      });

      const response = await Promise.race([
        service.requestOtp(phoneE164.trim()),
        timeoutPromise,
      ]) as Awaited<ReturnType<typeof service.requestOtp>>;

      // Display OTP to user
      if (response.otp) {
        setDisplayedOtp(response.otp);
        setOtp(response.otp); // Auto-fill OTP
      }
      setStep("otp");
      setCountdown(60);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : t("login.failedRequest");
      setError(errorMessage);
      console.error("OTP request error:", e);
    } finally {
      setBusy(false);
    }
  };

  // FAKE OTP BYPASS: Accept any OTP and check rider status
  const onVerifyOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const phone = phoneE164.trim();
      
      // Verify OTP (for now, accepts any OTP - will be replaced with MSG91 later)
      const session = await service.verifyOtp({ 
        phoneE164: phone, 
        otp: otp.trim() || displayedOtp || "123456", // Use displayed OTP or any OTP
        deviceId 
      });
      await setSession(session);
      
      // Check if rider exists
      const checkResult = await checkMobile.mutateAsync(phone);
      
      if (checkResult.exists && checkResult.riderId) {
        // Save riderId to onboarding store
        await setOnboardingData({ riderId: checkResult.riderId });
        
        // Existing rider - check onboarding status
        if (checkResult.onboardingStatus === "approved") {
          // Fully onboarded - go to home
          router.replace("/(tabs)/orders");
        } else if (checkResult.onboardingStatus === "pending_approval") {
          // Pending approval - go to pending screen
          router.replace("/(onboarding)/pending");
        } else {
          // In progress or not started - continue onboarding
          router.replace("/(onboarding)/aadhaar");
        }
      } else {
        // New rider - create rider record and start onboarding
        const createResult = await createRider.mutateAsync({
          phoneE164: phone,
          deviceId,
        });
        
        // Save riderId to onboarding store
        await setOnboardingData({ riderId: createResult.riderId });
        
        // Start onboarding flow
        router.replace("/(onboarding)/aadhaar");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.failedVerify"));
    } finally {
      setBusy(false);
    }
  };

  const onResendOtp = async () => {
    if (countdown > 0) return;
    await onRequestOtp();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 }} className="flex-1 px-6 pt-12 pb-8">
            {/* Logo/Brand Section */}
            <View style={{ alignItems: 'center', marginBottom: 48 }} className="items-center mb-12">
              <Logo size="large" vertical style={{ marginBottom: 24 }} />
              <Text style={{ fontSize: 30, fontWeight: 'bold', color: '#111827', marginBottom: 8 }} className="text-3xl font-bold text-gray-900 mb-2">{t("login.welcome")}</Text>
              <Text style={{ fontSize: 16, color: '#4B5563', textAlign: 'center' }} className="text-base text-gray-600 text-center">{t("login.tagline")}</Text>
            </View>

            {/* Form Section */}
            <View style={{ flex: 1, justifyContent: 'center' }} className="flex-1 justify-center">
              {step === "phone" ? (
                <>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 8 }} className="text-2xl font-bold text-gray-900 mb-2">{t("login.enterPhone")}</Text>
                  <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 24 }} className="text-sm text-gray-600 mb-6">{t("login.phoneDescription")}</Text>

                  <View style={{ marginBottom: 16 }} className="mb-4">
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }} className="text-sm font-medium text-gray-700 mb-2">{t("login.phoneNumber")}</Text>
                    <TextInput
                      value={phoneE164}
                      onChangeText={setPhoneE164}
                      placeholder={t("login.phonePlaceholder")}
                      placeholderTextColor={colors.gray[400]}
                      autoCapitalize="none"
                      keyboardType="phone-pad"
                      style={{ 
                        backgroundColor: '#F9FAFB', 
                        borderWidth: 1, 
                        borderColor: '#E5E7EB', 
                        borderRadius: 12, 
                        paddingHorizontal: 16, 
                        paddingVertical: 16, 
                        fontSize: 16, 
                        color: '#111827' 
                      }}
                      className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base text-gray-900"
                    />
                  </View>

                  {error && (
                    <View style={{ marginBottom: 16, padding: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8 }} className="mb-4 p-3 bg-error-50 border border-error-200 rounded-lg">
                      <Text style={{ fontSize: 14, color: colors.error[600] }} className="text-sm text-error-600">{error}</Text>
                    </View>
                  )}

                  <Button
                    onPress={onRequestOtp}
                    disabled={busy || phoneE164.trim().length < 10}
                    loading={busy}
                    size="lg"
                    className="mt-2"
                  >
                    {t("login.sendOtp")}
                  </Button>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 8 }} className="text-2xl font-bold text-gray-900 mb-2">{t("login.enterOtp")}</Text>
                  <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 16 }} className="text-sm text-gray-600 mb-6">
                    {t("login.otpDescription", { phone: phoneE164 })}
                  </Text>

                  {/* Display OTP to user */}
                  {displayedOtp && (
                    <View
                      style={{
                        marginBottom: 16,
                        padding: 16,
                        backgroundColor: "#E0F2FE",
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: colors.primary[300],
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: "#0369A1", marginBottom: 8, textAlign: "center" }}>
                        Your OTP (for development):
                      </Text>
                      <Text style={{ fontSize: 32, fontWeight: "bold", color: colors.primary[600], textAlign: "center", letterSpacing: 4 }}>
                        {displayedOtp}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#0284C7", marginTop: 8, textAlign: "center" }}>
                        This will be sent via SMS in production
                      </Text>
                    </View>
                  )}

                  <View style={{ marginBottom: 16 }} className="mb-4">
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 }} className="text-sm font-medium text-gray-700 mb-2">{t("login.otpCode")}</Text>
                    <TextInput
                      value={otp}
                      onChangeText={setOtp}
                      placeholder={t("login.otpPlaceholder")}
                      placeholderTextColor={colors.gray[400]}
                      keyboardType="number-pad"
                      maxLength={6}
                      style={{ 
                        backgroundColor: '#F9FAFB', 
                        borderWidth: 1, 
                        borderColor: '#E5E7EB', 
                        borderRadius: 12, 
                        paddingHorizontal: 16, 
                        paddingVertical: 16, 
                        fontSize: 24, 
                        color: '#111827', 
                        textAlign: 'center', 
                        letterSpacing: 8 
                      }}
                      className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base text-gray-900 text-center tracking-widest"
                    />
                  </View>

                  {error && (
                    <View style={{ marginBottom: 16, padding: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8 }} className="mb-4 p-3 bg-error-50 border border-error-200 rounded-lg">
                      <Text style={{ fontSize: 14, color: colors.error[600] }} className="text-sm text-error-600">{error}</Text>
                    </View>
                  )}

                  <Button
                    onPress={onVerifyOtp}
                    disabled={busy || otp.trim().length < 4}
                    loading={busy}
                    size="lg"
                    className="mt-2"
                  >
                    {t("login.verifyOtp")}
                  </Button>

                  <View style={{ marginTop: 24, alignItems: 'center' }} className="mt-6 items-center">
                    <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 8 }} className="text-sm text-gray-600 mb-2">
                      {t("login.didntReceive")}{" "}
                      {countdown > 0 && (
                        <Text style={{ fontWeight: '500' }} className="font-medium">{t("login.resendIn", { count: countdown })}</Text>
                      )}
                    </Text>
                    {countdown === 0 && (
                      <Button
                        onPress={onResendOtp}
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                      >
                        {t("login.resendOtp")}
                      </Button>
                    )}
                    <Button
                      onPress={() => {
                        setStep("phone");
                        setOtp("");
                        setDisplayedOtp(null);
                        setError(null);
                      }}
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                    >
                      {t("login.changePhone")}
                    </Button>
                  </View>
                </>
              )}
            </View>

            {/* Footer */}
            <View style={{ marginTop: 32 }} className="mt-8">
              <Text style={{ fontSize: 12, textAlign: 'center', color: '#6B7280' }} className="text-xs text-center text-gray-500">{t("login.terms")}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
