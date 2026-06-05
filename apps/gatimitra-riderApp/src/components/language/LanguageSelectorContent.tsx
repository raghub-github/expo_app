import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/src/stores/languageStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

type LanguageSelectorContentProps = {
  selected: LanguageCode;
  onSelect: (code: LanguageCode) => void;
  onProceed: () => void;
  onGetHelp?: () => void;
  proceedLoading?: boolean;
  compact?: boolean;
  fullScreen?: boolean;
};

export function LanguageSelectorContent({
  selected,
  onSelect,
  onProceed,
  onGetHelp,
  proceedLoading,
  compact,
  fullScreen,
}: LanguageSelectorContentProps) {
  const { t } = useTranslation();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        compact && styles.scrollCompact,
        fullScreen && styles.scrollFull,
      ]}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <View style={styles.header}>
        <Text style={styles.welcome}>
          {t("language.welcome", "Welcome to GatiMitra")}
        </Text>
        <Text style={styles.tagline}>
          {t("language.tagline", "Moving India Forward")}
        </Text>
        <Text style={styles.title}>
          {t("topbar.selectLanguage", "Select Language")}
        </Text>
        <Text style={styles.subtitle}>
          {t("language.selectOne", "Select one from below")}
        </Text>
      </View>

      <View style={styles.grid}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = selected === lang.code;
          return (
            <Pressable
              key={lang.code}
              onPress={() => onSelect(lang.code)}
              style={[
                styles.langCard,
                isSelected && styles.langCardSelected,
              ]}
            >
              <Text style={[styles.langNative, isSelected && styles.langNativeSelected]}>
                {lang.native}
              </Text>
              <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                {lang.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {onGetHelp ? (
        <Pressable onPress={onGetHelp} style={styles.helpWrap}>
          <Text style={styles.helpText}>{t("language.getHelp", "Get Help")}</Text>
        </Pressable>
      ) : null}

      <Button onPress={onProceed} loading={proceedLoading} size="lg" disabled={proceedLoading}>
        {t("language.proceed", "Proceed")}
      </Button>

      <Text style={styles.footer}>{t("language.poweredBy", "Powered by GatiMitra")}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  scrollCompact: {
    paddingTop: 4,
  },
  scrollFull: {
    flexGrow: 1,
    paddingTop: 32,
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  welcome: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.gray[900],
    marginBottom: 6,
    textAlign: "center",
  },
  tagline: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary[600],
    fontStyle: "italic",
    marginBottom: 14,
    textAlign: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.gray[700],
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: colors.gray[500],
    textAlign: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  langCard: {
    width: "47%",
    aspectRatio: 2.5,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gray[200],
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  langCardSelected: {
    borderColor: colors.primary[500],
    backgroundColor: colors.primary[50],
  },
  langNative: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.gray[900],
    marginBottom: 2,
  },
  langNativeSelected: {
    color: colors.primary[700],
  },
  langLabel: {
    fontSize: 11,
    color: colors.gray[500],
  },
  langLabelSelected: {
    color: colors.primary[600],
  },
  helpWrap: {
    marginBottom: 16,
    alignItems: "center",
  },
  helpText: {
    fontSize: 14,
    color: colors.primary[600],
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  footer: {
    marginTop: 20,
    fontSize: 12,
    color: colors.gray[400],
    textAlign: "center",
  },
});
