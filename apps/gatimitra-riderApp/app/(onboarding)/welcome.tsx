import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Button } from "@/src/components/ui/Button";
import { Logo } from "@/src/components/Logo";
import { colors } from "@/src/theme";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";

export default function WelcomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      >
        <View style={styles.body}>
          <View>
            <View style={styles.hero}>
              <Logo size="large" vertical style={{ marginBottom: 24 }} />
              <Text style={styles.title}>{t("onboarding.welcome.title")}</Text>
              <Text style={styles.subtitle}>{t("onboarding.welcome.subtitle")}</Text>
            </View>

            <View style={styles.features}>
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
            <Text style={styles.note}>{t("onboarding.welcome.timeNote")}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureRow}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDesc}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignSelf: "stretch", backgroundColor: RIDER_AUTH_BG },
  flex: { flex: 1, alignSelf: "stretch" },
  scroll: { flexGrow: 1 },
  body: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    justifyContent: "space-between",
  },
  hero: { alignItems: "center", marginBottom: 48 },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 17,
    color: colors.gray[600],
    textAlign: "center",
    paddingHorizontal: 16,
  },
  features: { marginBottom: 32 },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
  },
  featureIcon: { fontSize: 28, marginRight: 16 },
  featureCopy: { flex: 1, minWidth: 0 },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.gray[900],
    marginBottom: 4,
  },
  featureDesc: { fontSize: 14, color: colors.gray[600] },
  note: {
    marginTop: 16,
    fontSize: 12,
    textAlign: "center",
    color: colors.gray[500],
  },
});
