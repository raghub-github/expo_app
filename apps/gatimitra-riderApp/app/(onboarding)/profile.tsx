import React, { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";
import { fetchRiderReferralConfig, previewRiderReferral } from "@/src/services/referral.service";
import { REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE } from "@/src/lib/referralCopy";
import { storePendingReferral } from "@/src/lib/pendingReferral";

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState(i18n.language);
  const [referralCode, setReferralCode] = useState("");
  const [referralError, setReferralError] = useState<string | null>(null);
  const [riderReferralOn, setRiderReferralOn] = useState(true);
  const [checkingReferral, setCheckingReferral] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchRiderReferralConfig()
      .then((cfg) => {
        if (!cancelled) setRiderReferralOn(cfg?.referralEnabled === true);
      })
      .catch(() => {
        if (!cancelled) setRiderReferralOn(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const languages = [
    { code: "en", label: "English" },
    { code: "hi", label: "हिंदी" },
    { code: "mr", label: "मराठी" },
    { code: "ta", label: "தமிழ்" },
    { code: "te", label: "తెలుగు" },
    { code: "kn", label: "ಕನ್ನಡ" },
    { code: "gu", label: "ગુજરાતી" },
    { code: "bn", label: "বাংলা" },
    { code: "ml", label: "മലയാളം" },
    { code: "pa", label: "ਪੰਜਾਬੀ" },
  ];

  const canContinue = name.trim().length >= 2 && city.trim().length >= 2;

  const onContinue = async () => {
    if (language !== i18n.language) {
      i18n.changeLanguage(language);
    }
    if (riderReferralOn && referralCode.trim()) {
      setCheckingReferral(true);
      try {
        const preview = await previewRiderReferral(referralCode);
        if (!preview.ok) {
          setReferralError(
            preview.userMessage ||
              preview.message ||
              "Invalid referral code. Please check the code and try again.",
          );
          return;
        }
        await storePendingReferral({
          code: (preview.code || referralCode).trim().toUpperCase(),
          source: "manual",
        });
      } finally {
        setCheckingReferral(false);
      }
    }
    router.push("/(onboarding)/kyc");
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-6 pt-8 pb-8">
          <View className="mb-8">
            <Text className="text-3xl font-bold text-gray-900 mb-2">{t("onboarding.profile.title")}</Text>
            <Text className="text-base text-gray-600">{t("onboarding.profile.subtitle")}</Text>
          </View>

          <View className="flex-1">
            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">{t("onboarding.profile.fullName")} *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("onboarding.profile.fullNamePlaceholder")}
                placeholderTextColor={colors.gray[400]}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base font-bold text-gray-900"
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">{t("onboarding.profile.city")} *</Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder={t("onboarding.profile.cityPlaceholder")}
                placeholderTextColor={colors.gray[400]}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base font-bold text-gray-900"
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">{t("onboarding.profile.preferredLanguage")}</Text>
              <View className="flex-row flex-wrap gap-2">
                {languages.map((lang) => (
                  <Button
                    key={lang.code}
                    variant={language === lang.code ? "primary" : "outline"}
                    size="sm"
                    onPress={() => setLanguage(lang.code)}
                  >
                    {lang.label}
                  </Button>
                ))}
              </View>
            </View>

            <View className="mb-6">
              <Text className="text-sm font-medium text-gray-700 mb-2">{t("onboarding.profile.referralCode")}</Text>
              {riderReferralOn ? (
                <>
                  <TextInput
                    value={referralCode}
                    onChangeText={(v) => {
                      setReferralCode(v);
                      if (referralError) setReferralError(null);
                    }}
                    onBlur={() => {
                      const code = referralCode.trim();
                      if (!code) return;
                      void previewRiderReferral(code).then((preview) => {
                        if (!preview.ok) {
                          setReferralError(
                            preview.userMessage ||
                              preview.message ||
                              "Invalid referral code. Please check the code and try again.",
                          );
                        }
                      });
                    }}
                    placeholder={t("onboarding.profile.referralPlaceholder")}
                    placeholderTextColor={colors.gray[400]}
                    autoCapitalize="characters"
                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base font-bold text-gray-900"
                  />
                  {referralError ? (
                    <Text className="mt-2 text-sm text-red-600">{referralError}</Text>
                  ) : null}
                </>
              ) : (
                <>
                  <TextInput
                    value=""
                    editable={false}
                    placeholder={REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE}
                    placeholderTextColor={colors.gray[400]}
                    className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-4 text-base text-gray-400"
                  />
                  <Text className="mt-2 text-xs text-gray-500">{REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE}</Text>
                </>
              )}
            </View>
          </View>

          <Button onPress={() => void onContinue()} disabled={!canContinue || checkingReferral} size="lg">
            {t("onboarding.profile.continue")}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
