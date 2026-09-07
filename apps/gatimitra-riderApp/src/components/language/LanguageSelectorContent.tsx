import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/src/stores/languageStore";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { AuthPrimaryButton } from "@/src/components/auth/AuthPrimaryButton";
import {
  RIDER_AUTH_BG,
  RIDER_AUTH_INK,
  RIDER_AUTH_MUTED,
  RIDER_AUTH_SURFACE,
} from "@/src/theme/riderAuthTheme";
import { RiderFonts } from "@/src/theme/fonts";

type LanguageSelectorContentProps = {
  selected: LanguageCode;
  onSelect: (code: LanguageCode) => void;
  onProceed: () => void;
  onGetHelp?: () => void;
  onBack?: () => void;
  proceedLoading?: boolean;
  compact?: boolean;
  fullScreen?: boolean;
};

function RadioMark({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

export function LanguageSelectorContent({
  selected,
  onSelect,
  onProceed,
  onGetHelp,
  onBack,
  proceedLoading,
}: LanguageSelectorContentProps) {
  const { t } = useTranslation();
  const bottomInset = useRiderBottomInset();
  const footerPad = Math.max(bottomInset, 20) + 36;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.backRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              hitSlop={12}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel={t("common.back", "Back")}
            >
              <Ionicons name="arrow-back" size={24} color={RIDER_AUTH_INK} />
            </Pressable>
          ) : (
            <View style={styles.backBtn} />
          )}
        </View>
        <Text style={styles.title}>{t("topbar.selectLanguage", "Select language")}</Text>
        <Text style={styles.subtitle}>{t("language.selectOne", "Select one from below")}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.grid}>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            return (
              <Pressable
                key={lang.code}
                onPress={() => onSelect(lang.code)}
                style={[styles.langCard, isSelected && styles.langCardSelected]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
              >
                <View style={styles.langCopy}>
                  <Text style={styles.langNative} numberOfLines={1}>
                    {lang.native}
                  </Text>
                  <Text style={styles.langLabel} numberOfLines={1}>
                    {lang.label}
                  </Text>
                </View>
                <RadioMark selected={isSelected} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: footerPad }]}>
        {onGetHelp ? (
          <Pressable onPress={onGetHelp} style={styles.helpWrap}>
            <Text style={styles.helpText}>{t("language.getHelp", "Get Help")}</Text>
          </Pressable>
        ) : null}
        <AuthPrimaryButton
          label={t("language.proceed", "Proceed")}
          onPress={onProceed}
          loading={proceedLoading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    backgroundColor: RIDER_AUTH_BG,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 4,
    marginBottom: 8,
  },
  backRow: {
    width: "100%",
    marginBottom: 2,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  title: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 32,
    color: RIDER_AUTH_INK,
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 16,
    color: RIDER_AUTH_MUTED,
    textAlign: "center",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollInner: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  langCard: {
    width: "48.4%",
    minHeight: 96,
    borderRadius: 14,
    backgroundColor: RIDER_AUTH_SURFACE,
    paddingHorizontal: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: RIDER_AUTH_INK,
  },
  langCardSelected: {
    borderColor: RIDER_AUTH_INK,
    borderWidth: 2.5,
  },
  langCopy: {
    flex: 1,
    paddingRight: 8,
  },
  langNative: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 19,
    color: "#000000",
    marginBottom: 2,
  },
  langLabel: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 14,
    color: RIDER_AUTH_INK,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: "#16A34A",
    backgroundColor: RIDER_AUTH_SURFACE,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#16A34A",
  },
  footer: {
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: RIDER_AUTH_BG,
    flexShrink: 0,
  },
  helpWrap: {
    marginBottom: 12,
    alignItems: "center",
  },
  helpText: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 17,
    color: RIDER_AUTH_INK,
  },
});
