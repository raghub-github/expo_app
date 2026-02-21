/**
 * Language preference – user selects app language (English / हिन्दी).
 */

import { useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useLanguageStore, LANGUAGE_OPTIONS, type AppLanguage } from "@/store/languageStore";

const TEAL = "#14b8a6";
const TITLE_DARK = "#0f172a";
const TEXT_GRAY = "#64748b";
const CARD_BG = "#FFFFFF";
const BORDER_LIGHT = "#f1f5f9";
const SURFACE = "#f8fafc";

const SHADOW_SOFT = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 4,
  elevation: 2,
};

export default function LanguageScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { language, setLanguage, hydrate } = useLanguageStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.hint}>{t("language.chooseLanguage")}</Text>
        <View style={[styles.card, SHADOW_SOFT]}>
          {LANGUAGE_OPTIONS.map((opt) => {
            const isSelected = language === opt.code;
            return (
              <TouchableOpacity
                key={opt.code}
                style={[styles.row, opt.code !== "en" && styles.rowBorder]}
                onPress={() => setLanguage(opt.code as AppLanguage)}
                activeOpacity={0.7}
              >
                <View style={styles.rowContent}>
                  <Text style={styles.rowLabel}>{t(`languages.${opt.code}`)}</Text>
                </View>
                {isSelected ? (
                  <Ionicons name="checkmark-circle" size={24} color={TEAL} />
                ) : (
                  <View style={styles.radioOuter} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SURFACE },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16 },
  hint: {
    fontSize: 14,
    color: TEXT_GRAY,
    marginBottom: 16,
    lineHeight: 20,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: BORDER_LIGHT },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: "500", color: TITLE_DARK },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: BORDER_LIGHT,
  },
});
