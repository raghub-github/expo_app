// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useState } from "react";
import { Modal, View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import {
  useLanguageStore,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "@/src/stores/languageStore";
import { LanguageSelectorContent } from "./LanguageSelectorContent";
import { LanguageRestartModal } from "./LanguageRestartModal";
import { RIDER_AUTH_BG } from "@/src/theme/riderAuthTheme";

type LanguageSelectionSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Login / pre-auth: apply i18n immediately, skip the in-app restart confirm. */
  applyImmediately?: boolean;
};

export function LanguageSelectionSheet({
  visible,
  onClose,
  applyImmediately = false,
}: LanguageSelectionSheetProps) {
  const { i18n } = useTranslation();
  const selectedLanguage = useLanguageStore((s) => s.selectedLanguage);
  const languageSelected = useLanguageStore((s) => s.languageSelected);
  const setSelectedLanguage = useLanguageStore((s) => s.setSelectedLanguage);

  const activeCode: LanguageCode =
    (languageSelected && SUPPORTED_LANGUAGES.some((l) => l.code === selectedLanguage)
      ? selectedLanguage
      : SUPPORTED_LANGUAGES.some((l) => l.code === i18n.language)
        ? (i18n.language as LanguageCode)
        : "en");

  const [draft, setDraft] = useState<LanguageCode>(activeCode);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (visible) {
      setDraft(activeCode);
      setShowRestartModal(false);
    }
  }, [visible, activeCode]);

  const handleProceed = async () => {
    if (draft === activeCode) {
      onClose();
      return;
    }
    if (applyImmediately) {
      try {
        await setSelectedLanguage(draft);
      } catch (error) {
        console.warn("[LanguageSelectionSheet] Failed to apply language:", error);
      }
      onClose();
      return;
    }
    onClose();
    setShowRestartModal(true);
  };

  const handleRestartCancel = () => {
    setShowRestartModal(false);
    setDraft(activeCode);
  };

  const handleRestartProceed = async () => {
    if (applying) return;
    setApplying(true);
    try {
      await setSelectedLanguage(draft);
      setShowRestartModal(false);
    } catch (error) {
      console.warn("[LanguageSelectionSheet] Failed to apply language:", error);
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      {visible ? (
      <Modal
        visible
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View style={styles.root}>
          <StatusBar style="dark" />
          <SafeAreaView style={styles.safe} edges={["top"]}>
            <LanguageSelectorContent
              fullScreen
              selected={draft}
              onSelect={setDraft}
              onProceed={handleProceed}
              onBack={onClose}
              onGetHelp={() => {
                onClose();
                router.push({ pathname: "/raise-ticket", params: { prelogin: "1" } });
              }}
            />
          </SafeAreaView>
        </View>
      </Modal>
      ) : null}

      <LanguageRestartModal
        visible={showRestartModal}
        onCancel={handleRestartCancel}
        onProceed={handleRestartProceed}
        loading={applying}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: RIDER_AUTH_BG,
  },
  safe: {
    flex: 1,
    backgroundColor: RIDER_AUTH_BG,
  },
});
