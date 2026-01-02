import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Button } from "@/src/components/ui/Button";

export default function KycScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-6 pt-8 pb-8">
          <View className="mb-8">
            <Text className="text-3xl font-bold text-gray-900 mb-2">{t("onboarding.kyc.title")}</Text>
            <Text className="text-base text-gray-600">{t("onboarding.kyc.subtitle")}</Text>
          </View>

          <View className="flex-1">
            <View className="bg-warning-50 border border-warning-200 rounded-xl p-4 mb-6">
              <Text className="text-sm font-medium text-warning-800 mb-1">
                {t("onboarding.kyc.documentsRequired")}
              </Text>
              <Text className="text-sm text-warning-700">
                • {t("onboarding.kyc.aadhaar")} - {t("onboarding.kyc.optional")} but recommended{"\n"}
                • {t("onboarding.kyc.pan")} - {t("onboarding.kyc.required")}{"\n"}
                • {t("onboarding.kyc.drivingLicense")} - {t("onboarding.kyc.required")}{"\n"}
                • {t("onboarding.kyc.rc")} - {t("onboarding.kyc.required")}{"\n"}
                • {t("onboarding.kyc.bankAccount")} - {t("onboarding.kyc.required")}
              </Text>
            </View>

            <View className="space-y-4 mb-6">
              <KycItem title={t("onboarding.kyc.aadhaar")} status="optional" />
              <KycItem title={t("onboarding.kyc.pan")} status="required" />
              <KycItem title={t("onboarding.kyc.drivingLicense")} status="required" />
              <KycItem title={t("onboarding.kyc.rc")} status="required" />
              <KycItem title={t("onboarding.kyc.bankAccount")} status="required" />
            </View>

            <Text className="text-xs text-gray-500 mb-6">{t("onboarding.kyc.note")}</Text>
          </View>

          <View>
            <Button onPress={() => router.push("/(onboarding)/payment")} size="lg">
              {t("onboarding.kyc.completeLater")}
            </Button>
            <Button
              variant="outline"
              onPress={() => {
                // TODO: Open KYC upload flow
              }}
              size="lg"
              className="mt-3"
            >
              {t("onboarding.kyc.uploadNow")}
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function KycItem({ title, status }: { title: string; status: "required" | "optional" }) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-center justify-between p-4 bg-gray-50 rounded-xl">
      <View className="flex-1">
        <Text className="text-base font-medium text-gray-900">{title}</Text>
        <Text className="text-xs text-gray-500 mt-1">
          {status === "required" ? t("onboarding.kyc.required") : t("onboarding.kyc.optional")}
        </Text>
      </View>
      <View className="w-6 h-6 rounded-full border-2 border-gray-300" />
    </View>
  );
}
