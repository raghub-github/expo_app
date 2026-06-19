import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import {
  customerSupportService,
  type FraudReportOption,
  type FraudReportTargetType,
} from "@/services/customerSupport.service";

const REPORT_RED = "#E23744";
const REPORT_RED_DISABLED = "#F3B4BA";
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const BORDER = "#EBEBEB";

type Props = {
  visible: boolean;
  targetType: FraudReportTargetType;
  onClose: () => void;
  onSubmit: (payload: { optionCodes: string[]; customDetails: string }) => void;
  submitting?: boolean;
};

function FraudCheckbox({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.optionRow} onPress={onToggle} accessibilityRole="checkbox">
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
    </Pressable>
  );
}

export function ReportFraudBottomSheet({
  visible,
  targetType,
  onClose,
  onSubmit,
  submitting = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [customDetails, setCustomDetails] = useState("");

  const optionsQ = useQuery({
    queryKey: ["fraud-report-options", targetType],
    queryFn: () => customerSupportService.getFraudReportOptions(targetType),
    enabled: visible,
    staleTime: 300_000,
  });

  const options = optionsQ.data ?? [];

  useEffect(() => {
    if (!visible) {
      setSelectedCodes([]);
      setCustomDetails("");
    }
  }, [visible]);

  const title =
    targetType === "merchant"
      ? "Report a fraud by the restaurant"
      : "Report a fraud by the delivery partner";

  const showDetailsField = useMemo(
    () => options.some((o) => o.requires_details && selectedCodes.includes(o.option_code)),
    [options, selectedCodes]
  );

  const canSubmit = useMemo(() => {
    if (selectedCodes.length === 0 || submitting) return false;
    if (showDetailsField && customDetails.trim().length < 10) return false;
    return true;
  }, [customDetails, selectedCodes, showDetailsField, submitting]);

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.root}>
        <Pressable style={styles.dim} onPress={onClose} accessibilityLabel="Close" />

        <Pressable style={styles.closeFab} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <Text style={styles.title}>{title}</Text>

          {optionsQ.isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={REPORT_RED} />
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {options.map((option, idx) => (
                <View key={option.option_code}>
                  {idx > 0 ? <View style={styles.divider} /> : null}
                  <FraudCheckbox
                    label={option.option_text}
                    checked={selectedCodes.includes(option.option_code)}
                    onToggle={() => toggleCode(option.option_code)}
                  />
                </View>
              ))}

              {showDetailsField ? (
                <TextInput
                  value={customDetails}
                  onChangeText={setCustomDetails}
                  placeholder="Share more details"
                  placeholderTextColor={MUTED}
                  style={styles.detailsInput}
                  multiline
                  maxLength={2000}
                  textAlignVertical="top"
                />
              ) : null}
            </ScrollView>
          )}

          <Pressable
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            disabled={!canSubmit}
            onPress={() =>
              onSubmit({
                optionCodes: selectedCodes,
                customDetails: customDetails.trim(),
              })
            }
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Report fraud</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  closeFab: {
    alignSelf: "center",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2F2F2F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    zIndex: 2,
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 18,
    maxHeight: "72%",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
    lineHeight: 24,
    marginBottom: 12,
  },
  loadingWrap: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    maxHeight: 360,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: REPORT_RED,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: REPORT_RED,
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: TEXT,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    borderStyle: "dashed",
  },
  detailsInput: {
    marginTop: 8,
    minHeight: 96,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TEXT,
    backgroundColor: "#FAFAFA",
  },
  submitBtn: {
    marginTop: 14,
    backgroundColor: REPORT_RED,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  submitBtnDisabled: {
    backgroundColor: REPORT_RED_DISABLED,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
