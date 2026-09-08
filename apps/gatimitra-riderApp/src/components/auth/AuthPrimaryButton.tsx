import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import {
  SLIDE_ACTION_GREEN,
  SLIDE_ACTION_GREEN_BORDER,
} from "@/src/theme/slideAction";
import { RiderFonts } from "@/src/theme/fonts";
import { RIDER_AUTH_DISABLED, RIDER_AUTH_DISABLED_TEXT, RIDER_AUTH_INK } from "@/src/theme/riderAuthTheme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

/** Same lime track + dark label as the incoming-order accept slider. */
export function AuthPrimaryButton({ label, onPress, disabled, loading }: Props) {
  const isInactive = Boolean(disabled || loading);

  return (
    <TouchableOpacity
      activeOpacity={isInactive ? 1 : 0.88}
      onPress={() => {
        if (!isInactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive }}
      style={[styles.btn, isInactive && styles.btnDisabled]}
    >
      {loading ? (
        <ActivityIndicator color={isInactive ? RIDER_AUTH_DISABLED_TEXT : RIDER_AUTH_INK} />
      ) : (
        <Text style={[styles.label, isInactive && styles.labelDisabled]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: SLIDE_ACTION_GREEN,
    borderWidth: 2,
    borderColor: SLIDE_ACTION_GREEN_BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  btnDisabled: {
    backgroundColor: RIDER_AUTH_DISABLED,
    borderColor: "#94A3B8",
  },
  label: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 20,
    color: RIDER_AUTH_INK,
  },
  labelDisabled: {
    color: RIDER_AUTH_DISABLED_TEXT,
  },
});
