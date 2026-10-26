import { useCallback, useEffect, useRef } from "react";
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import {
  OTP_BOXES,
  applyOtpBackspace,
  applyOtpInput,
  type OtpEditResult,
} from "@/lib/otpDigitEdit";
import { StoreFonts } from "@/constants/storeTypography";

const DARK_SURFACE = "#1A1C1E";
const TEXT_ON_TEAL = "#FFFFFF";
const PLACEHOLDER_GRAY = "#9CA3AF";
const CONTROL_RADIUS = 10;

type Props = {
  cells: string[];
  activeIndex: number;
  editable?: boolean;
  onCellsChange: (cells: string[]) => void;
  onActiveIndexChange: (index: number) => void;
};

function focusNative(node: TextInput | null) {
  if (!node) return;
  try {
    node.focus();
  } catch {
    /* unmounted / not focusable */
  }
}

export function OtpCodeInputs({
  cells,
  activeIndex,
  editable = true,
  onCellsChange,
  onActiveIndexChange,
}: Props) {
  const inputRefs = useRef<Array<TextInput | null>>(Array.from({ length: OTP_BOXES }, () => null));
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const indexRef = useRef(activeIndex);
  indexRef.current = activeIndex;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const commit = useCallback(
    (result: OtpEditResult) => {
      if (!mountedRef.current || !editable) return;
      cellsRef.current = result.cells;
      indexRef.current = result.index;
      onCellsChange(result.cells);
      onActiveIndexChange(result.index);
      const node = inputRefs.current[result.index] ?? null;
      focusNative(node);
    },
    [editable, onActiveIndexChange, onCellsChange]
  );

  const focusIndex = useCallback(
    (index: number) => {
      if (!mountedRef.current || !editable) return;
      const next = Math.max(0, Math.min(OTP_BOXES - 1, index));
      indexRef.current = next;
      onActiveIndexChange(next);
      focusNative(inputRefs.current[next] ?? null);
    },
    [editable, onActiveIndexChange]
  );

  useEffect(() => {
    const t = setTimeout(() => focusIndex(indexRef.current), 40);
    return () => clearTimeout(t);
    // Mount-only: do not steal focus back to box 1 on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.row} accessibilityLabel="OTP input">
      {Array.from({ length: OTP_BOXES }, (_, i) => {
        const digit = cells[i] ?? "";
        const focused = activeIndex === i;
        return (
          <TextInput
            key={`otp-box-${i}`}
            ref={(node) => {
              inputRefs.current[i] = node;
            }}
            style={[styles.box, focused && styles.boxActive]}
            value={digit}
            placeholder="0"
            placeholderTextColor={PLACEHOLDER_GRAY}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={OTP_BOXES}
            caretHidden
            selectTextOnFocus={false}
            showSoftInputOnFocus
            editable={editable}
            contextMenuHidden={false}
            autoCorrect={false}
            autoCapitalize="none"
            autoComplete={i === 0 ? "sms-otp" : "off"}
            textContentType={i === 0 ? "oneTimeCode" : "none"}
            importantForAutofill={i === 0 ? "yes" : "no"}
            underlineColorAndroid="transparent"
            selectionColor={TEXT_ON_TEAL}
            returnKeyType="done"
            blurOnSubmit={false}
            allowFontScaling={false}
            accessibilityLabel={`OTP digit ${i + 1} of ${OTP_BOXES}`}
            onPressIn={() => {
              if (!editable) return;
              focusIndex(i);
            }}
            onFocus={() => {
              indexRef.current = i;
              onActiveIndexChange(i);
            }}
            onChangeText={(text) => {
              const result = applyOtpInput(cellsRef.current, i, text);
              const unchanged =
                result.index === indexRef.current &&
                result.cells.every((d, idx) => d === cellsRef.current[idx]);
              if (unchanged) return;
              commit(result);
            }}
            onKeyPress={(e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
              if (e.nativeEvent.key !== "Backspace") return;
              if (cellsRef.current[i]) return;
              commit(applyOtpBackspace(cellsRef.current, i));
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 6,
    width: "100%",
  },
  box: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 56,
    minWidth: 36,
    minHeight: 52,
    backgroundColor: DARK_SURFACE,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: CONTROL_RADIUS,
    color: TEXT_ON_TEAL,
    fontSize: 22,
    fontFamily: StoreFonts.poppinsBold,
    textAlign: "center",
    padding: 0,
    ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null),
  },
  boxActive: {
    borderColor: "#FFFFFF",
  },
});
