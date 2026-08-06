/**
 * Receiver details bottom sheet — name + mobile, pick from contacts or type manually.
 */

import { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as Contacts from "expo-contacts";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

/** Darker green CTA (matches parcel book button). */
const CTA_GREEN = GatiMitraColors.deepMintStart;

type Props = {
  visible: boolean;
  onClose: () => void;
  vehicleName: string;
  initialName?: string;
  initialMobile?: string;
  onConfirm: (details: { name: string; mobile: string }) => void;
};

function digits10(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

export function ParcelReceiverDetailsBottomSheet({
  visible,
  onClose,
  vehicleName,
  initialName = "",
  initialMobile = "",
  onConfirm,
}: Props) {
  const [name, setName] = useState(initialName);
  const [mobile, setMobile] = useState(digits10(initialMobile));
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(initialName);
    setMobile(digits10(initialMobile));
  }, [visible, initialName, initialMobile]);

  const pickFromContacts = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Contacts",
          "Please allow contacts access to pick a receiver from your phonebook."
        );
        return;
      }
      const c = await Contacts.presentContactPickerAsync();
      if (!c) return;
      const composed = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
      const dn = (typeof c.name === "string" ? c.name : composed).trim();
      const raw = c.phoneNumbers?.[0]?.number ?? "";
      const phone = digits10(raw);
      if (dn) setName(dn);
      if (phone) setMobile(phone);
    } catch {
      Alert.alert("Contacts", "Contact picker is not available on this device.");
    } finally {
      setPicking(false);
    }
  }, [picking]);

  const nameOk = name.trim().length >= 2;
  const mobileOk = mobile.length === 10;
  const canSubmit = nameOk && mobileOk;

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.68}
      keyboardAvoiding
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.handle} />
        <AppText style={styles.title}>Receiver details</AppText>
        <AppText style={styles.subtitle}>
          Who should receive this parcel on {vehicleName}?
        </AppText>

        <TouchableOpacity
          style={styles.pickContactBtn}
          onPress={() => void pickFromContacts()}
          activeOpacity={0.85}
          disabled={picking}
        >
          {picking ? (
            <ActivityIndicator size="small" color={CTA_GREEN} />
          ) : (
            <Ionicons name="person-circle-outline" size={22} color={CTA_GREEN} />
          )}
          <AppText style={styles.pickContactText}>Pick from contacts</AppText>
          <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
        </TouchableOpacity>

        <AppText style={styles.orLabel}>or enter manually</AppText>

        <View style={styles.field}>
          <AppText style={styles.label}>Receiver name</AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter full name"
            placeholderTextColor="#94A3B8"
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <AppText style={styles.label}>Mobile number</AppText>
          <View style={styles.phoneRow}>
            <AppText style={styles.prefix}>+91</AppText>
            <TextInput
              value={mobile}
              onChangeText={(t) => setMobile(t.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile"
              placeholderTextColor="#94A3B8"
              style={[styles.input, styles.phoneInput]}
              keyboardType="phone-pad"
              maxLength={10}
              returnKeyType="done"
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.confirmBtn, !canSubmit && styles.confirmBtnDisabled]}
          activeOpacity={0.9}
          disabled={!canSubmit}
          onPress={() => onConfirm({ name: name.trim(), mobile })}
        >
          <AppText style={styles.confirmBtnText}>Confirm & continue</AppText>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginTop: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 20,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  pickContactBtn: {
    marginHorizontal: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: GatiMitraColors.mintHighlight,
    backgroundColor: GatiMitraColors.mintSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickContactText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.deepMintStart,
  },
  orLabel: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
    marginBottom: 10,
  },
  field: {
    paddingHorizontal: 18,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  prefix: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    overflow: "hidden",
  },
  phoneInput: {
    flex: 1,
  },
  confirmBtn: {
    marginHorizontal: 18,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: CTA_GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.45,
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
});
