/**
 * Confirm / edit alternate contact name after picking from device contacts.
 */

import { useCallback, useEffect, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import { maskPhone } from "@/lib/order-delivery-details";

const MINT = GatiMitraColors.primaryMint;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;

type Props = {
  visible: boolean;
  initialName: string;
  phone: string;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void | Promise<void>;
};

export function AlternateContactNameSheet({
  visible,
  initialName,
  phone,
  saving = false,
  onClose,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
  }, [visible, initialName]);

  const handleConfirm = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Enter a name for this alternate contact.");
      return;
    }
    try {
      await onConfirm(trimmed);
    } catch {
      /* Parent handles errors */
    }
  }, [name, onConfirm]);

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.42} keyboardAvoiding>
      <View style={styles.content}>
        <AppText style={styles.title}>Edit contact name</AppText>
        <AppText style={styles.subtitle}>
          Delivery partner will call this number. You can edit how the name appears.
        </AppText>

        <AppText style={styles.fieldLabel}>Name</AppText>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Contact name"
          placeholderTextColor={MUTED}
          style={styles.input}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!saving}
        />

        <AppText style={styles.fieldLabel}>Phone number</AppText>
        <View style={styles.phoneReadonly}>
          <AppText style={styles.phoneText}>{maskPhone(phone) || phone}</AppText>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={() => void handleConfirm()}
          activeOpacity={0.9}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <AppText style={styles.saveBtnText}>Save alternate contact</AppText>
          )}
        </TouchableOpacity>
      </View>
      <View style={{ height: Math.max(insets.bottom, 12) }} />
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: MUTED,
    fontWeight: "500",
  },
  fieldLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "700",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
    backgroundColor: "#fff",
  },
  phoneReadonly: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#F9FAFB",
  },
  phoneText: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
  },
  saveBtn: {
    marginTop: 22,
    backgroundColor: MINT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
});
