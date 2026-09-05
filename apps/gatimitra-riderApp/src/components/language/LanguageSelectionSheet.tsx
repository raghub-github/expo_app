// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import {
  useLanguageStore,
  SUPPORTED_LANGUAGES,
  type LanguageCode,
} from "@/src/stores/languageStore";
import { DismissibleBottomSheetShell } from "./DismissibleBottomSheetShell";
import { useTabBarBottomOffset } from "@/src/hooks/useTabBarBottomOffset";
import { LanguageSelectorContent } from "./LanguageSelectorContent";
import { LanguageRestartModal } from "./LanguageRestartModal";

type LanguageSelectionSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function LanguageSelectionSheet({ visible, onClose }: LanguageSelectionSheetProps) {
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

  const handleProceed = () => {
    if (draft === activeCode) {
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

  const tabBarOffset = useTabBarBottomOffset();

  return (
    <>
      <DismissibleBottomSheetShell
        visible={visible}
        onDismiss={onClose}
        maxHeightRatio={0.9}
        bottomOffset={tabBarOffset}
      >
        <LanguageSelectorContent
          compact
          selected={draft}
          onSelect={setDraft}
          onProceed={handleProceed}
          onGetHelp={() => {
            onClose();
            router.push({ pathname: "/raise-ticket", params: { prelogin: "1" } });
          }}
        />
      </DismissibleBottomSheetShell>

      <LanguageRestartModal
        visible={showRestartModal}
        onCancel={handleRestartCancel}
        onProceed={handleRestartProceed}
        loading={applying}
      />
    </>
  );
}
