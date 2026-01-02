import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Button } from "@/src/components/ui/Button";

export default function WelcomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 px-6 pt-12 pb-8 justify-between">
          <View>
            <View className="items-center mb-12">
              <View className="w-24 h-24 rounded-3xl bg-primary-500 items-center justify-center mb-6">
                <Text className="text-white text-4xl font-bold">GM</Text>
              </View>
              <Text className="text-4xl font-bold text-gray-900 mb-4 text-center">
                {t("onboarding.welcome.title")}
              </Text>
              <Text className="text-lg text-gray-600 text-center px-4">
                {t("onboarding.welcome.subtitle")}
              </Text>
            </View>

            <View className="space-y-4 mb-8">
              <FeatureItem
                icon="🚀"
                title={t("onboarding.welcome.flexibleEarnings")}
                description={t("onboarding.welcome.flexibleEarningsDesc")}
              />
              <FeatureItem
                icon="📍"
                title={t("onboarding.welcome.smartNavigation")}
                description={t("onboarding.welcome.smartNavigationDesc")}
              />
              <FeatureItem
                icon="💰"
                title={t("onboarding.welcome.quickPayouts")}
                description={t("onboarding.welcome.quickPayoutsDesc")}
              />
              <FeatureItem
                icon="🛡️"
                title={t("onboarding.welcome.securePlatform")}
                description={t("onboarding.welcome.securePlatformDesc")}
              />
            </View>
          </View>

          <View>
            <Button onPress={() => router.push("/(onboarding)/profile")} size="lg">
              {t("onboarding.welcome.getStarted")}
            </Button>
            <Text className="text-xs text-center text-gray-500 mt-4">
              {t("onboarding.welcome.timeNote")}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <View className="flex-row items-start p-4 bg-gray-50 rounded-xl mb-3">
      <Text className="text-3xl mr-4">{icon}</Text>
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900 mb-1">{title}</Text>
        <Text className="text-sm text-gray-600">{description}</Text>
      </View>
    </View>
  );
}
