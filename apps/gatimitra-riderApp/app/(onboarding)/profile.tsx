import React, { useState } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState(i18n.language);
  const [referralCode, setReferralCode] = useState("");

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

  const onContinue = () => {
    // Update app language if changed
    if (language !== i18n.language) {
      i18n.changeLanguage(language);
    }
    // TODO: Save profile to backend
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
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base text-gray-900"
              />
            </View>

            <View className="mb-4">
              <Text className="text-sm font-medium text-gray-700 mb-2">{t("onboarding.profile.city")} *</Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder={t("onboarding.profile.cityPlaceholder")}
                placeholderTextColor={colors.gray[400]}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base text-gray-900"
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
              <TextInput
                value={referralCode}
                onChangeText={setReferralCode}
                placeholder={t("onboarding.profile.referralPlaceholder")}
                placeholderTextColor={colors.gray[400]}
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-base text-gray-900"
              />
            </View>
          </View>

          <Button onPress={onContinue} disabled={!canContinue} size="lg">
            {t("onboarding.profile.continue")}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
