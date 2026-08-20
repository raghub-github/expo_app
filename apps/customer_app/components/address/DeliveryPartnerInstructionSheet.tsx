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
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
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
  /** Optional override — Modal can drop theme context on some Android builds. */
  dark?: boolean;
};

export function DeliveryPartnerInstructionSheet({
  visible,
  onClose,
  addressLine,
  initialInstructions = [],
  saveLabel = "Save",
  onSave,
  dark: darkProp,
}: DeliveryPartnerInstructionSheetProps) {
  const insets = useSafeAreaInsets();
  const ctxDark = useMerchantUiDark();
  const dark = darkProp ?? ctxDark;
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

  const iconColor = dark ? MerchantDarkPalette.text : GatiMitraColors.textPrimary;
  const mutedIcon = dark ? MerchantDarkPalette.textDim : "#9CA3AF";

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.88}
      keyboardAvoiding
      sheetStyle={dark ? styles.sheetDark : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <AppText style={[styles.title, dark && styles.titleDark]}>Instruction for Delivery partner</AppText>
        <AppText style={[styles.addr, dark && styles.addrDark]} numberOfLines={4}>
          {addressLine}
        </AppText>

        <TextInput
          style={[styles.noteInput, dark && styles.noteInputDark]}
          value={note}
          onChangeText={setNote}
          placeholder="Add a short note for your delivery partner (optional)"
          placeholderTextColor={dark ? MerchantDarkPalette.textDim : "#9CA3AF"}
          multiline
          maxLength={240}
          textAlignVertical="top"
          editable={!saving}
        />

        <View style={[styles.voiceRow, dark && styles.voiceRowDark, styles.disabledBlock]} pointerEvents="none">
          <Ionicons name="mic-outline" size={20} color={mutedIcon} />
          <AppText style={[styles.voiceHintDisabled, dark && styles.mutedDark]}>
            Tap and hold to record instruction
          </AppText>
          <AppText style={[styles.comingSoon, dark && styles.comingSoonDark]}>Soon</AppText>
        </View>

        <AppText style={[styles.imageLabel, styles.disabledLabel, dark && styles.mutedDark]}>
          Door/building image (optional)
        </AppText>
        <View style={[styles.imageDashed, dark && styles.imageDashedDark, styles.disabledBlock]} pointerEvents="none">
          <Ionicons name="camera-outline" size={22} color={mutedIcon} />
          <AppText style={[styles.imageCtaDisabled, dark && styles.mutedDark]}>Add an image</AppText>
        </View>
        <AppText style={[styles.imageHelp, styles.disabledLabel, dark && styles.mutedDark]}>
          This helps our delivery partners find your exact location faster
        </AppText>

        <CheckRow
          icon={<MaterialCommunityIcons name="door-open" size={22} color={iconColor} />}
          label="Leave at door"
          checked={leaveAtDoor}
          onToggle={() => setLeaveAtDoor((v) => !v)}
          dark={dark}
        />
        <CheckRow
          icon={<Ionicons name="shield-checkmark-outline" size={22} color={iconColor} />}
          label="Leave with guard"
          checked={leaveWithGuard}
          onToggle={() => setLeaveWithGuard((v) => !v)}
          dark={dark}
        />
        <CheckRow
          icon={<MaterialCommunityIcons name="phone-off-outline" size={22} color={iconColor} />}
          label="Avoid calling"
          checked={avoidCalling}
          onToggle={() => setAvoidCalling((v) => !v)}
          dark={dark}
        />
        <CheckRow
          icon={<Ionicons name="notifications-off-outline" size={22} color={iconColor} />}
          label="Don't ring the bell"
          checked={dontRingBell}
          onToggle={() => setDontRingBell((v) => !v)}
          dark={dark}
        />
        <CheckRow
          icon={<Ionicons name="paw-outline" size={22} color={iconColor} />}
          label="Pet at home"
          checked={petAtHome}
          onToggle={() => setPetAtHome((v) => !v)}
          dark={dark}
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
  dark,
  last = false,
}: {
  icon: ReactNode;
  label: string;
  checked: boolean;
  onToggle: () => void;
  dark: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.checkLine, dark && styles.checkLineDark, last && styles.checkLineLast]}>
      <View style={styles.checkLeft}>
        {icon}
        <AppText style={[styles.checkLabel, dark && styles.checkLabelDark]}>{label}</AppText>
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
  sheetDark: {
    backgroundColor: MerchantDarkPalette.surface,
  },
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
  titleDark: {
    color: MerchantDarkPalette.text,
  },
  addr: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 17,
    marginBottom: 12,
  },
  addrDark: {
    color: MerchantDarkPalette.textMuted,
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
  noteInputDark: {
    borderColor: MerchantDarkPalette.border,
    backgroundColor: MerchantDarkPalette.elevated,
    color: MerchantDarkPalette.text,
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
  voiceRowDark: {
    borderColor: MerchantDarkPalette.border,
    backgroundColor: MerchantDarkPalette.elevated,
  },
  voiceHintDisabled: { flex: 1, fontSize: 13, color: "#9CA3AF" },
  mutedDark: { color: MerchantDarkPalette.textDim },
  comingSoon: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  comingSoonDark: {
    color: MerchantDarkPalette.textMuted,
    backgroundColor: MerchantDarkPalette.chip,
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
  imageDashedDark: {
    borderColor: MerchantDarkPalette.border,
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
  checkLineDark: {
    borderBottomColor: MerchantDarkPalette.border,
  },
  checkLineLast: { borderBottomWidth: 0 },
  checkLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  checkLabel: { fontSize: 14, fontWeight: "500", color: "#111827", flex: 1 },
  checkLabelDark: { color: MerchantDarkPalette.text },
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
