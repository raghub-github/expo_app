// @refresh reset
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import {
  RIDER_LOGOUT_REASON_OPTIONS,
  type RiderLogoutReasonCode,
} from "@/src/lib/rider-logout-reasons";
import { colors } from "@/src/theme";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

const SHEET_RADIUS = 24;
const FOOTER_ROW_H = 48;
const FOOTER_GAP = 12;

type LogoutReasonBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reasonCode: RiderLogoutReasonCode, reasonText?: string) => Promise<void>;
};

export function LogoutReasonBottomSheet({
  visible,
  onClose,
  onConfirm,
}: LogoutReasonBottomSheetProps) {
  const { t } = useTranslation();
  const { rs, insets, height, width, isShortHeight } = useResponsiveLayout();
  const hPad = rs(20);

  const [selected, setSelected] = useState<RiderLogoutReasonCode | null>(null);
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const bottomPad = resolveRiderBottomInset(insets.bottom) + rs(12);
  const maxSheetHeight = Math.round(height * (isShortHeight ? 0.92 : 0.88));
  const btnWidth = Math.floor((width - hPad * 2 - FOOTER_GAP) / 2);

  useEffect(() => {
    if (visible) {
      setSelected(null);
      setOtherText("");
      setSubmitting(false);
    }
  }, [visible]);

  const canContinue = useMemo(() => {
    if (!selected) return false;
    if (selected === "OTHER") return otherText.trim().length > 0;
    return true;
  }, [selected, otherText]);

  const handleContinue = async () => {
    if (!selected || !canContinue || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm(
        selected,
        selected === "OTHER" ? otherText.trim() : undefined,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <ResponsiveSheetBody
            maxHeight={maxSheetHeight - bottomPad - 24}
            contentContainerStyle={{ paddingHorizontal: 0 }}
            footerStyle={{ paddingHorizontal: hPad }}
            footerBottomInset={bottomPad}
            footer={
              <View style={[rowLayout.row, styles.footerRow]}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onClose}
                  disabled={submitting}
                  style={[styles.cancelBtn, { width: btnWidth }]}
                >
                  <Text style={styles.cancelBtnTxt} numberOfLines={1}>
                    {t("profile.cancelLogout", "Cancel")}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={canContinue ? 0.85 : 1}
                  onPress={handleContinue}
                  disabled={submitting}
                  style={[
                    styles.continueBtn,
                    { width: btnWidth },
                    !canContinue && styles.continueBtnDisabled,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.continueBtnTxt} numberOfLines={1}>
                      {t("profile.logoutReason.continue", "Continue")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            }
          >
            <Text style={[styles.title, { paddingHorizontal: hPad }, flexShrinkText]} numberOfLines={2}>
              {t("profile.logoutReason.title", "Why are you logging out?")}
            </Text>
            <Text style={[styles.subtitle, { paddingHorizontal: hPad }, flexShrinkText]} numberOfLines={2}>
              {t(
                "profile.logoutReason.subtitle",
                "Help us improve your experience",
              )}
            </Text>

            <View style={[styles.optionsBlock, { paddingHorizontal: hPad }]}>
              {RIDER_LOGOUT_REASON_OPTIONS.map((option) => {
                const isSelected = selected === option.code;
                return (
                  <TouchableOpacity
                    key={option.code}
                    activeOpacity={0.7}
                    disabled={submitting}
                    onPress={() => setSelected(option.code)}
                    style={[
                      rowLayout.row,
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        rowLayout.noShrink,
                        isSelected && styles.radioOuterSelected,
                      ]}
                    >
                      {isSelected ? <View style={styles.radioInner} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.optionLabel,
                        flexShrinkText,
                        isSelected && styles.optionLabelSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {t(option.labelKey, option.defaultLabel)}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {selected === "OTHER" ? (
                <TextInput
                  value={otherText}
                  onChangeText={setOtherText}
                  placeholder={t(
                    "profile.logoutReason.otherPlaceholder",
                    "Please tell us more...",
                  )}
                  placeholderTextColor="#94A3B8"
                  style={styles.otherInput}
                  multiline
                  maxLength={500}
                  editable={!submitting}
                />
              ) : null}
            </View>
          </ResponsiveSheetBody>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  sheet: {
    width: "100%",
    maxWidth: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    paddingTop: 10,
    overflow: "hidden",
    ...(Platform.OS === "android"
      ? { elevation: 24 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
        }),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 24,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  optionsBlock: {
    maxWidth: "100%",
  },
  optionRow: {
    paddingVertical: 13,
    maxWidth: "100%",
  },
  optionRowSelected: {
    backgroundColor: colors.primary[50],
    marginHorizontal: -4,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  radioOuterSelected: {
    borderColor: colors.primary[500],
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary[500],
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    color: "#111827",
    lineHeight: 21,
  },
  optionLabelSelected: {
    fontWeight: "600",
  },
  otherInput: {
    marginTop: 4,
    marginBottom: 4,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    fontSize: 14,
    color: "#111827",
    textAlignVertical: "top",
    maxWidth: "100%",
  },
  footerRow: {
    justifyContent: "space-between",
    width: "100%",
    gap: FOOTER_GAP,
  },
  cancelBtn: {
    height: FOOTER_ROW_H,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnTxt: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
  },
  continueBtn: {
    height: FOOTER_ROW_H,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnDisabled: {
    backgroundColor: "#99F6E4",
  },
  continueBtnTxt: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
