import React from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

export type OnboardingPickerOption = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  options: OnboardingPickerOption[];
  onCancel: () => void;
  cancelLabel?: string;
};

/** Custom action sheet — use instead of system `Alert.alert` pickers. */
export function OnboardingPickerModal({
  visible,
  title,
  message,
  options,
  onCancel,
  cancelLabel = "Cancel",
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.options}>
            {options.map((opt) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  onCancel();
                  opt.onPress();
                }}
                style={({ pressed }) => [styles.optionBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                {opt.icon ? (
                  <Ionicons name={opt.icon} size={18} color="#0f172a" />
                ) : null}
                <Text style={styles.optionText}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.gray[600],
    textAlign: "center",
    marginBottom: 12,
  },
  options: {
    gap: 8,
    marginBottom: 10,
  },
  optionBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0f172a",
  },
  cancelBtn: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray[100],
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[700],
  },
  pressed: {
    opacity: 0.88,
  },
});
