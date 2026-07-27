import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { ContinueButton } from "@/src/components/onboarding/OnboardingFormUi";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";

type Props = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  options: string[];
  selected?: string | null;
  onClose: () => void;
  onSelect: (modelLabel: string) => void;
};

/**
 * Bottom sheet to pick one model when a catalog vehicle row lists multiple names.
 * Footer is absolutely pinned so Continue is never clipped by the list / safe area.
 */
export function VehicleModelPickerSheet({
  visible,
  title = "Select your vehicle",
  subtitle = "Choose the model you will operate on GatiMitra",
  options,
  selected,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<string | null>(selected ?? null);
  const bottomPad = Math.max(insets.bottom, 12);
  // Continue (~52) + gap (10) + Cancel (~48) + paddings
  const footerHeight = 52 + 10 + 48 + bottomPad + 16;

  useEffect(() => {
    if (visible) setDraft(selected ?? null);
  }, [visible, selected]);

  if (!visible) return null;

  const canContinue = Boolean(draft?.trim());

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
          accessibilityRole="button"
        />

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingBottom: footerHeight }}
            showsVerticalScrollIndicator
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            {options.map((name) => {
              const isSelected = draft === name;
              return (
                <TouchableOpacity
                  key={name}
                  activeOpacity={0.85}
                  onPress={() => setDraft(name)}
                  style={[styles.rowOuter, isSelected && styles.rowOuterSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.rowInner}>
                    <Text
                      style={[styles.rowLabel, isSelected && styles.rowLabelSelected]}
                      numberOfLines={2}
                    >
                      {name}
                    </Text>
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.footerPinned, { paddingBottom: bottomPad }]}>
            <ContinueButton
              label="Continue"
              disabled={!canContinue}
              onPress={() => {
                if (!draft?.trim()) return;
                onSelect(draft.trim());
              }}
            />
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onClose}
              style={styles.cancelBtn}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    position: "relative",
    width: "100%",
    maxHeight: "82%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
    }),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray[200],
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: colors.gray[500],
    marginBottom: 14,
  },
  list: {
    maxHeight: 420,
  },
  rowOuter: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    backgroundColor: "#ffffff",
    overflow: "hidden",
    marginBottom: 10,
  },
  rowOuterSelected: {
    borderColor: ACCENT,
    backgroundColor: "#f0fdf4",
  },
  rowInner: {
    width: "100%",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowLabel: {
    flex: 1,
    marginRight: 12,
    fontSize: 15,
    fontWeight: "600",
    color: colors.gray[800],
    textAlign: "left",
    ...Platform.select({
      android: { includeFontPadding: false },
    }),
  },
  rowLabelSelected: {
    color: ACCENT_DARK,
    fontWeight: "700",
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.gray[300],
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: ACCENT,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  footerPinned: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 50,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: colors.gray[100],
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  cancelBtn: {
    width: "100%",
    minHeight: 48,
    marginTop: 10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    backgroundColor: "#ffffff",
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.gray[700],
  },
});
