import { useState, useEffect, useRef } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Modal, Pressable, TextInput, StyleSheet, KeyboardAvoidingView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";

/** Parse "H", "HH", "HH:MM", "HHMM" into { h, m }. Clamp h 0-23, m 0-59. */
function parseTimeInput(raw: string): { h: number; m: number } | null {
  const s = raw.replace(/\s/g, "").trim() || "0";
  const colon = s.indexOf(":");
  let hStr: string;
  let mStr: string;
  if (colon >= 0) {
    hStr = s.slice(0, colon);
    mStr = s.slice(colon + 1);
  } else {
    if (s.length <= 2) {
      hStr = s;
      mStr = "0";
    } else {
      hStr = s.slice(0, -2);
      mStr = s.slice(-2);
    }
  }
  const h = Math.min(23, Math.max(0, parseInt(hStr, 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(mStr, 10) || 0));
  return { h, m };
}

function formatTimeForDisplay(date: Date): string {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type TimePickerModalProps = {
  visible: boolean;
  value: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  title?: string;
};

export function TimePickerModal({
  visible,
  value,
  onConfirm,
  onCancel,
  title = "Select time",
}: TimePickerModalProps) {
  const [localTime, setLocalTime] = useState<Date>(() => new Date(value.getTime()));
  const [editText, setEditText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setLocalTime(new Date(value.getTime()));
      setEditText(formatTimeForDisplay(value));
      setIsEditing(false);
    }
  }, [visible, value]);

  useEffect(() => {
    if (!isEditing) setEditText(formatTimeForDisplay(localTime));
  }, [localTime, isEditing]);

  const syncFromText = () => {
    const parsed = parseTimeInput(editText);
    if (parsed) {
      const next = new Date(localTime);
      next.setHours(parsed.h, parsed.m, 0, 0);
      setLocalTime(next);
    }
    setIsEditing(false);
  };

  const handleTextChange = (t: string) => {
    setEditText(t);
    const parsed = parseTimeInput(t);
    if (parsed) {
      const next = new Date(localTime);
      next.setHours(parsed.h, parsed.m, 0, 0);
      setLocalTime(next);
    }
  };

  const handleConfirm = () => {
    syncFromText();
    onConfirm(localTime);
  };

  const handleCancel = () => {
    setIsEditing(false);
    onCancel();
  };

  const content = (
    <View style={styles.sheet}>
      <Text style={styles.title}>{title}</Text>

      {/* Tappable / editable time display */}
      <View style={styles.timeDisplayWrap}>
        {isEditing ? (
          <TextInput
            ref={inputRef}
            style={styles.timeInput}
            value={editText}
            onChangeText={handleTextChange}
            onBlur={syncFromText}
            placeholder="18:00"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
            keyboardType="number-pad"
            maxLength={5}
            selectTextOnFocus
            autoFocus
          />
        ) : (
          <Pressable
            style={({ pressed }) => [styles.timeDisplayBox, pressed && styles.pressed]}
            onPress={() => {
              setIsEditing(true);
              setEditText(formatTimeForDisplay(localTime));
              setTimeout(() => inputRef.current?.focus(), 100);
            }}
          >
            <Text style={styles.timeDisplayText}>{formatTimeForDisplay(localTime)}</Text>
            <Text style={styles.timeDisplayHint}>Tap to type</Text>
            <Ionicons name="create-outline" size={18} color={GatiMitraMerchant.textTertiary} style={styles.timeDisplayIcon} />
          </Pressable>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable style={({ pressed }) => [styles.btn, styles.btnCancel, pressed && styles.pressed]} onPress={handleCancel}>
          <Text style={styles.btnCancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.btn, styles.btnOk, pressed && styles.pressed]} onPress={handleConfirm}>
          <Text style={styles.btnOkText}>OK</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleCancel}>
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <KeyboardAvoidingView behavior="padding" style={styles.keyboard}>
          <Pressable style={[styles.backdropInner, styles.sheetBottom]} onPress={(e) => e.stopPropagation()}>
            {content}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  backdropInner: {
    backgroundColor: GatiMitraMerchant.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Math.max(20, 34),
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetBottom: {
    maxHeight: "85%",
  },
  keyboard: {
    width: "100%",
  },
  sheet: {
    width: "100%",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  timeDisplayWrap: {
    marginBottom: 8,
  },
  timeDisplayBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  timeDisplayText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
  },
  timeDisplayHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
  },
  timeDisplayIcon: {
    opacity: 0.9,
  },
  timeInput: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 2,
    borderColor: GatiMitraMerchant.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 28,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    minWidth: 90,
    alignItems: "center",
  },
  btnCancel: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  btnOk: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  btnCancelText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  btnOkText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  pressed: {
    opacity: 0.85,
  },
});
