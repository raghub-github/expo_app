/**
 * Delivery partner instruction bottom sheet — shared by checkout and live order tracking.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, Pressable, ScrollView, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  buildDeliveryInstructionsList,
  parseDeliveryInstructionsList,
} from "@/lib/delivery-instructions";

const MINT = GatiMitraColors.primaryMint;

type DeliveryPartnerInstructionSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Address line shown under the title. */
  addressLine: string;
  initialInstructions?: string[];
  saveLabel?: string;
  onSave: (instructions: string[]) => Promise<void>;
};

export function DeliveryPartnerInstructionSheet({
  visible,
  onClose,
  addressLine,
  initialInstructions = [],
  saveLabel = "Save",
  onSave,
}: DeliveryPartnerInstructionSheetProps) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState("");
  const [leaveAtDoor, setLeaveAtDoor] = useState(true);
  const [leaveWithGuard, setLeaveWithGuard] = useState(false);
  const [avoidCalling, setAvoidCalling] = useState(false);
  const [dontRingBell, setDontRingBell] = useState(false);
  const [petAtHome, setPetAtHome] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedInitial = useMemo(
    () => parseDeliveryInstructionsList(initialInstructions),
    [initialInstructions]
  );

  useEffect(() => {
    setNote(parsedInitial.note);
    setLeaveAtDoor(parsedInitial.leaveAtDoor);
    setLeaveWithGuard(parsedInitial.leaveWithGuard);
    setAvoidCalling(parsedInitial.avoidCalling);
    setDontRingBell(parsedInitial.dontRingBell);
    setPetAtHome(parsedInitial.petAtHome);
  }, [parsedInitial, visible]);

  const handleSave = useCallback(async () => {
    const list = buildDeliveryInstructionsList({
      note,
      leaveAtDoor,
      leaveWithGuard,
      avoidCalling,
      dontRingBell,
      petAtHome,
    });
    setSaving(true);
    try {
      await onSave(list);
      onClose();
    } catch (err) {
      Alert.alert(
        "Could not save instructions",
        err instanceof Error ? err.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  }, [
    note,
    leaveAtDoor,
    leaveWithGuard,
    avoidCalling,
    dontRingBell,
    petAtHome,
    onClose,
    onSave,
  ]);

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.88} keyboardAvoiding>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <AppText style={styles.title}>Instruction for Delivery partner</AppText>
        <AppText style={styles.addr} numberOfLines={4}>
          {addressLine}
        </AppText>

        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Add a short note for your delivery partner (optional)"
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={240}
          textAlignVertical="top"
          editable={!saving}
        />

        <View style={[styles.voiceRow, styles.disabledBlock]} pointerEvents="none">
          <Ionicons name="mic-outline" size={20} color="#9CA3AF" />
          <AppText style={styles.voiceHintDisabled}>Tap and hold to record instruction</AppText>
          <AppText style={styles.comingSoon}>Soon</AppText>
        </View>

        <AppText style={[styles.imageLabel, styles.disabledLabel]}>Door/building image (optional)</AppText>
        <View style={[styles.imageDashed, styles.disabledBlock]} pointerEvents="none">
          <Ionicons name="camera-outline" size={22} color="#9CA3AF" />
          <AppText style={styles.imageCtaDisabled}>Add an image</AppText>
        </View>
        <AppText style={[styles.imageHelp, styles.disabledLabel]}>
          This helps our delivery partners find your exact location faster
        </AppText>

        <CheckRow
          icon={<MaterialCommunityIcons name="door-open" size={22} color={GatiMitraColors.textPrimary} />}
          label="Leave at door"
          checked={leaveAtDoor}
          onToggle={() => setLeaveAtDoor((v) => !v)}
        />
        <CheckRow
          icon={<Ionicons name="shield-checkmark-outline" size={22} color={GatiMitraColors.textPrimary} />}
          label="Leave with guard"
          checked={leaveWithGuard}
          onToggle={() => setLeaveWithGuard((v) => !v)}
        />
        <CheckRow
          icon={<MaterialCommunityIcons name="phone-off-outline" size={22} color={GatiMitraColors.textPrimary} />}
          label="Avoid calling"
          checked={avoidCalling}
          onToggle={() => setAvoidCalling((v) => !v)}
        />
        <CheckRow
          icon={<Ionicons name="notifications-off-outline" size={22} color={GatiMitraColors.textPrimary} />}
          label="Don't ring the bell"
          checked={dontRingBell}
          onToggle={() => setDontRingBell((v) => !v)}
        />
        <CheckRow
          icon={<Ionicons name="paw-outline" size={22} color={GatiMitraColors.textPrimary} />}
          label="Pet at home"
          checked={petAtHome}
          onToggle={() => setPetAtHome((v) => !v)}
          last
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={() => void handleSave()}
          activeOpacity={0.9}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <AppText style={styles.saveBtnText}>{saveLabel}</AppText>
          )}
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

function CheckRow({
  icon,
  label,
  checked,
  onToggle,
  last = false,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onToggle: () => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.checkLine, last && styles.checkLineLast]}>
      <View style={styles.checkLeft}>
        {icon}
        <AppText style={styles.checkLabel}>{label}</AppText>
      </View>
      <Pressable
        onPress={onToggle}
        style={[styles.checkBox, checked && styles.checkBoxOn]}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        {checked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  addr: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
    marginBottom: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    marginBottom: 12,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 14,
    backgroundColor: "#FAFAFA",
  },
  voiceHintDisabled: { flex: 1, fontSize: 13, color: "#9CA3AF" },
  comingSoon: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  disabledBlock: { opacity: 0.42 },
  disabledLabel: { opacity: 0.55 },
  imageLabel: { fontSize: 11, color: "#9CA3AF", marginBottom: 6 },
  imageDashed: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 6,
  },
  imageCtaDisabled: { fontSize: 14, fontWeight: "700", color: "#9CA3AF" },
  imageHelp: { fontSize: 11, color: "#9CA3AF", marginBottom: 4, lineHeight: 15 },
  checkLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  checkLineLast: { borderBottomWidth: 0 },
  checkLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  checkLabel: { fontSize: 14, fontWeight: "500", color: "#111827", flex: 1 },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: MINT,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: MINT, borderColor: MINT },
  saveBtn: {
    marginTop: 12,
    backgroundColor: MINT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
});
