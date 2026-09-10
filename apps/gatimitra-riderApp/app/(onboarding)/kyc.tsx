import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";

export default function KycScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      >
        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>{t("onboarding.kyc.title")}</Text>
            <Text style={styles.subtitle}>{t("onboarding.kyc.subtitle")}</Text>
          </View>

          <View style={styles.flex}>
            <View style={styles.warnBox}>
              <Text style={styles.warnTitle}>{t("onboarding.kyc.documentsRequired")}</Text>
              <Text style={styles.warnBody}>
                • {t("onboarding.kyc.aadhaar")} - {t("onboarding.kyc.optional")} but recommended{"\n"}
                • {t("onboarding.kyc.pan")} - {t("onboarding.kyc.required")}{"\n"}
                • {t("onboarding.kyc.drivingLicense")} - {t("onboarding.kyc.required")}{"\n"}
                • {t("onboarding.kyc.rc")} - {t("onboarding.kyc.required")}{"\n"}
                • {t("onboarding.kyc.bankAccount")} - {t("onboarding.kyc.required")}
              </Text>
            </View>

            <View style={styles.list}>
              <KycItem title={t("onboarding.kyc.aadhaar")} status="optional" />
              <KycItem title={t("onboarding.kyc.pan")} status="required" />
              <KycItem title={t("onboarding.kyc.drivingLicense")} status="required" />
              <KycItem title={t("onboarding.kyc.rc")} status="required" />
              <KycItem title={t("onboarding.kyc.bankAccount")} status="required" />
            </View>

            <Text style={styles.note}>{t("onboarding.kyc.note")}</Text>
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
              style={styles.uploadBtn}
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
    <View style={styles.itemRow}>
      <View style={styles.itemCopy}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemStatus}>
          {status === "required" ? t("onboarding.kyc.required") : t("onboarding.kyc.optional")}
        </Text>
      </View>
      <View style={styles.itemDot} />
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
    paddingTop: 32,
    paddingBottom: 32,
  },
  headerBlock: { marginBottom: 32 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 8,
  },
  subtitle: { fontSize: 16, color: colors.gray[600] },
  warnBox: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  warnTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#92400e",
    marginBottom: 4,
  },
  warnBody: { fontSize: 14, color: "#b45309", lineHeight: 20 },
  list: { gap: 12, marginBottom: 24 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
  },
  itemCopy: { flex: 1, minWidth: 0, marginRight: 12 },
  itemTitle: { fontSize: 16, fontWeight: "500", color: colors.gray[900] },
  itemStatus: { fontSize: 12, color: colors.gray[500], marginTop: 4 },
  itemDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gray[300],
  },
  note: { fontSize: 12, color: colors.gray[500], marginBottom: 24 },
  uploadBtn: { marginTop: 12 },
});
