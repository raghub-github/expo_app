// @refresh reset
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import {
  RIDER_LOGOUT_REASON_OPTIONS,
  type RiderLogoutReasonCode,
} from "@/src/lib/rider-logout-reasons";
import { colors } from "@/src/theme";

const HPAD = 20;
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
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();

  const [selected, setSelected] = useState<RiderLogoutReasonCode | null>(null);
  const [otherText, setOtherText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const bottomInset = Math.max(insets.bottom, 16);
  const maxSheetHeight = Math.round(winH * 0.88);
  const btnWidth = Math.floor((winW - HPAD * 2 - FOOTER_GAP) / 2);

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
          <ScrollView
            style={{ maxHeight: maxSheetHeight }}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: bottomInset },
            ]}
          >
            <View style={styles.handle} />

            <Text style={styles.title}>
              {t("profile.logoutReason.title", "Why are you logging out?")}
            </Text>
            <Text style={styles.subtitle}>
              {t(
                "profile.logoutReason.subtitle",
                "Help us improve your experience",
              )}
            </Text>

            <View style={styles.optionsBlock}>
              {RIDER_LOGOUT_REASON_OPTIONS.map((option) => {
                const isSelected = selected === option.code;
                return (
                  <TouchableOpacity
                    key={option.code}
                    activeOpacity={0.7}
                    disabled={submitting}
                    onPress={() => setSelected(option.code)}
                    style={[
                      styles.optionRow,
                      isSelected && styles.optionRowSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.radioOuter,
                        isSelected && styles.radioOuterSelected,
                      ]}
                    >
                      {isSelected ? <View style={styles.radioInner} /> : null}
                    </View>
                    <Text
                      style={[
                        styles.optionLabel,
                        isSelected && styles.optionLabelSelected,
                      ]}
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

            <View style={styles.footer}>
              <View style={styles.footerRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onClose}
                  disabled={submitting}
                  style={[styles.cancelBtn, { width: btnWidth }]}
                >
                  <Text style={styles.cancelBtnTxt}>
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
                    <Text style={styles.continueBtnTxt}>
                      {t("profile.logoutReason.continue", "Continue")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    ...(Platform.OS === "android"
      ? { elevation: 24 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.15,
          shadowRadius: 16,
        }),
  },
  scrollContent: {
    flexGrow: 0,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  title: {
    paddingHorizontal: HPAD,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 24,
  },
  subtitle: {
    paddingHorizontal: HPAD,
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  optionsBlock: {
    paddingHorizontal: HPAD,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
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
  },
  footer: {
    paddingHorizontal: HPAD,
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
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
