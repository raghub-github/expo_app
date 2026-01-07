import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useLanguageStore, SUPPORTED_LANGUAGES } from "@/src/stores/languageStore";
import { getItem } from "@/src/utils/storage";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function LanguageScreen() {
  const { i18n } = useTranslation();
  const { selectedLanguage, languageSelected, setSelectedLanguage, hydrate } = useLanguageStore();
  // Only use stored language if it was explicitly selected, otherwise default to "en" but don't mark as selected
  const [selected, setSelected] = useState<string>(languageSelected ? selectedLanguage : "en");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initLanguage = async () => {
      try {
        await hydrate();
        // After hydration, check if a language was previously selected
        const storedLang = await getItem("gm_selected_language_v1");
        if (storedLang) {
          setSelected(storedLang);
          try {
            await i18n.changeLanguage(storedLang);
          } catch (i18nError) {
            console.warn("[LanguageScreen] Error changing i18n language:", i18nError);
          }
        } else {
          // No language selected yet, ensure we start with "en" but don't mark as selected
          setSelected("en");
          try {
            await i18n.changeLanguage("en");
          } catch (i18nError) {
            console.warn("[LanguageScreen] Error setting default i18n language:", i18nError);
          }
        }
      } catch (error) {
        console.error("[LanguageScreen] Error initializing language:", error);
        // Fallback to English on error
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
    // Only update if language was explicitly selected
    if (languageSelected && selectedLanguage) {
      setSelected(selectedLanguage);
      i18n.changeLanguage(selectedLanguage);
    }
  }, [selectedLanguage, languageSelected, i18n]);

  const handleLanguageSelect = async (code: string) => {
    setSelected(code);
    i18n.changeLanguage(code);
    // Immediately save the language selection
    try {
      await setSelectedLanguage(code);
    } catch (error) {
      console.warn("Error saving language immediately:", error);
    }
  };

  const handleProceed = async () => {
    if (loading) return; // Prevent double submission
    
    setLoading(true);
    try {
      // Ensure a language is selected
      const langToSave = selected || "en";
      
      // Save language selection
      await setSelectedLanguage(langToSave);
      
      // Small delay to ensure state is saved
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Navigate to permissions
      router.replace("/(permissions)/request");
    } catch (error) {
      console.error("[LanguageScreen] Error saving language:", error);
      // Continue anyway - don't block user
      try {
        router.replace("/(permissions)/request");
      } catch (navError) {
        console.error("[LanguageScreen] Navigation error:", navError);
        // Last resort - try push instead of replace
        router.push("/(permissions)/request");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGetHelp = () => {
    // Navigate to help/ticket screen
    router.push("/(onboarding)/help");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 48 }}>
          <Text style={{ fontSize: 28, fontWeight: "bold", color: "#111827", marginBottom: 8, textAlign: "center" }}>
            Welcome to GatiMitra
          </Text>
          <Text style={{ fontSize: 18, fontWeight: "600", color: "#374151", marginBottom: 16, textAlign: "center" }}>
            Select Language
          </Text>
          <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center" }}>
            Select one from below
          </Text>
        </View>

        {/* Language Grid */}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 32,
            }}
          >
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = selected === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => handleLanguageSelect(lang.code)}
                  style={{
                    width: "47%",
                    aspectRatio: 2.5,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.primary[500] : "#E5E7EB",
                    backgroundColor: isSelected ? colors.primary[50] : "#FFFFFF",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "600",
                      color: isSelected ? colors.primary[700] : "#111827",
                      marginBottom: 4,
                    }}
                  >
                    {lang.native}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: isSelected ? colors.primary[600] : "#6B7280",
                    }}
                  >
                    {lang.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Get Help Button */}
          <View style={{ marginBottom: 24, alignItems: "center" }}>
            <Pressable onPress={handleGetHelp}>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.primary[600],
                  fontWeight: "500",
                  textDecorationLine: "underline",
                }}
              >
                Get Help
              </Text>
            </Pressable>
          </View>

          {/* Proceed Button */}
          <Button onPress={handleProceed} loading={loading} size="lg" disabled={loading}>
            Proceed
          </Button>
        </View>

        {/* Footer */}
        <View style={{ marginTop: 32, alignItems: "center" }}>
          <Text style={{ fontSize: 12, color: "#9CA3AF" }}>Powered by GatiMitra</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

