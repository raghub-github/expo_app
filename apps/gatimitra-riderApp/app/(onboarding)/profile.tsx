import React, { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";
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
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={styles.flex}
      >
        <View style={styles.body}>
          <View style={styles.headerBlock}>
            <Text style={styles.title}>{t("onboarding.profile.title")}</Text>
            <Text style={styles.subtitle}>{t("onboarding.profile.subtitle")}</Text>
          </View>

          <View style={styles.flex}>
            <View style={styles.field}>
              <Text style={styles.label}>{t("onboarding.profile.fullName")} *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={t("onboarding.profile.fullNamePlaceholder")}
                placeholderTextColor={colors.gray[400]}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t("onboarding.profile.city")} *</Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder={t("onboarding.profile.cityPlaceholder")}
                placeholderTextColor={colors.gray[400]}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t("onboarding.profile.preferredLanguage")}</Text>
              <View style={styles.langWrap}>
                {languages.map((lang) => (
                  <View key={lang.code} style={styles.langChip}>
                    <Button
                      variant={language === lang.code ? "primary" : "outline"}
                      size="sm"
                      onPress={() => setLanguage(lang.code)}
                    >
                      {lang.label}
                    </Button>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.referralBlock}>
              <Text style={styles.label}>{t("onboarding.profile.referralCode")}</Text>
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
                    style={styles.input}
                  />
                  {referralError ? <Text style={styles.errorText}>{referralError}</Text> : null}
                </>
              ) : (
                <>
                  <TextInput
                    value=""
                    editable={false}
                    placeholder={REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE}
                    placeholderTextColor={colors.gray[400]}
                    style={[styles.input, styles.inputDisabled]}
                  />
                  <Text style={styles.hint}>{REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE}</Text>
                </>
              )}
            </View>
          </View>

          <Button
            onPress={() => void onContinue()}
            disabled={!canContinue || checkingReferral}
            size="lg"
          >
            {t("onboarding.profile.continue")}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  field: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.gray[700],
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.gray[200],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: "700",
    color: colors.gray[900],
  },
  inputDisabled: {
    backgroundColor: colors.gray[100],
    color: colors.gray[400],
    fontWeight: "400",
  },
  langWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  langChip: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 88,
  },
  referralBlock: { marginBottom: 24 },
  errorText: { marginTop: 8, fontSize: 14, color: colors.error[600] },
  hint: { marginTop: 8, fontSize: 12, color: colors.gray[500] },
});
