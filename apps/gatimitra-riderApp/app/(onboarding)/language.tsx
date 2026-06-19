// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  useLanguageStore,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "@/src/stores/languageStore";
import { getItem } from "@/src/utils/storage";
import { LanguageSelectorContent } from "@/src/components/language/LanguageSelectorContent";

export default function LanguageScreen() {
  const { i18n } = useTranslation();
  const { selectedLanguage, languageSelected, setSelectedLanguage, hydrate } = useLanguageStore();
  const [selected, setSelected] = useState<string>(languageSelected ? selectedLanguage : "en");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initLanguage = async () => {
      try {
        await hydrate();
        const storedLang = await getItem("gm_selected_language_v1");
        if (storedLang) {
          setSelected(storedLang);
          try {
            await i18n.changeLanguage(storedLang);
          } catch (i18nError) {
            console.warn("[LanguageScreen] Error changing i18n language:", i18nError);
          }
        } else {
          setSelected("en");
          try {
            await i18n.changeLanguage("en");
          } catch (i18nError) {
            console.warn("[LanguageScreen] Error setting default i18n language:", i18nError);
          }
        }
      } catch (error) {
        console.error("[LanguageScreen] Error initializing language:", error);
        setSelected("en");
        try {
          await i18n.changeLanguage("en");
        } catch (i18nError) {
          console.warn("[LanguageScreen] Error setting fallback language:", i18nError);
        }
      }
    };
    initLanguage();
  }, [hydrate, i18n]);

  useEffect(() => {
    if (languageSelected && selectedLanguage) {
      setSelected(selectedLanguage);
      i18n.changeLanguage(selectedLanguage);
    }
  }, [selectedLanguage, languageSelected, i18n]);

  const handleLanguageSelect = async (code: LanguageCode) => {
    setSelected(code);
    i18n.changeLanguage(code);
    try {
      await setSelectedLanguage(code);
    } catch (error) {
      console.warn("Error saving language immediately:", error);
    }
  };

  const handleProceed = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const langToSave: LanguageCode =
        selected && SUPPORTED_LANGUAGES.some((l) => l.code === selected)
          ? (selected as LanguageCode)
          : "en";

      await setSelectedLanguage(langToSave);
      await new Promise((resolve) => setTimeout(resolve, 100));
      router.replace("/(permissions)/request");
    } catch (error) {
      console.error("[LanguageScreen] Error saving language:", error);
      try {
        router.replace("/(permissions)/request");
      } catch (navError) {
        console.error("[LanguageScreen] Navigation error:", navError);
        router.push("/(permissions)/request");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <LanguageSelectorContent
        fullScreen
        selected={selected as LanguageCode}
        onSelect={handleLanguageSelect}
        onProceed={handleProceed}
        onGetHelp={() => router.push({ pathname: "/raise-ticket", params: { prelogin: "1" } })}
        proceedLoading={loading}
      />
    </SafeAreaView>
  );
}
