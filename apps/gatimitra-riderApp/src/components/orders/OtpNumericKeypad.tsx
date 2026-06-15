import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

const KEY_HEIGHT = 56;
const H_PAD = 12;
const KEY_GAP = 8;

type Props = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
};

type KeyDef = {
  id: string;
  digit?: string;
  letters?: string;
  kind?: "blank" | "back";
};

const ROWS: KeyDef[][] = [
  [
    { id: "1", digit: "1" },
    { id: "2", digit: "2", letters: "ABC" },
    { id: "3", digit: "3", letters: "DEF" },
  ],
  [
    { id: "4", digit: "4", letters: "GHI" },
    { id: "5", digit: "5", letters: "JKL" },
    { id: "6", digit: "6", letters: "MNO" },
  ],
  [
    { id: "7", digit: "7", letters: "PQRS" },
    { id: "8", digit: "8", letters: "TUV" },
    { id: "9", digit: "9", letters: "WXYZ" },
  ],
  [
    { id: "blank", kind: "blank" },
    { id: "0", digit: "0" },
    { id: "back", kind: "back" },
  ],
];

export function OtpNumericKeypad({ onDigit, onBackspace, disabled = false }: Props) {
  const { width } = useWindowDimensions();
  const keyWidth = useMemo(() => {
    const available = width - H_PAD * 2 - KEY_GAP * 2;
    return Math.floor(available / 3);
  }, [width]);

  return (
    <View style={styles.panel} collapsable={false} pointerEvents="auto">
      {ROWS.map((row, rowIdx) => (
        <View key={`row-${rowIdx}`} style={[styles.row, { gap: KEY_GAP }]}>
          {row.map((key) => {
            if (key.kind === "blank") {
              return <View key={key.id} style={{ width: keyWidth, height: KEY_HEIGHT }} />;
            }

            if (key.kind === "back") {
              return (
                <Pressable
                  key={key.id}
                  disabled={disabled}
                  onPress={onBackspace}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.key,
                    styles.backKey,
                    { width: keyWidth, height: KEY_HEIGHT },
                    disabled && styles.keyDisabled,
                    pressed && !disabled && styles.keyPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete"
                >
                  <Ionicons name="backspace-outline" size={26} color={colors.primary[700]} />
                </Pressable>
              );
            }

            return (
              <Pressable
                key={key.id}
                disabled={disabled}
                onPress={() => onDigit(key.digit!)}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.key,
                  { width: keyWidth, height: KEY_HEIGHT },
                  disabled && styles.keyDisabled,
                  pressed && !disabled && styles.keyPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={key.digit}
              >
                <Text style={styles.digitText}>{key.digit}</Text>
                {key.letters ? <Text style={styles.lettersText}>{key.letters}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: "#EEF2F7",
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 8 : 10,
    paddingHorizontal: H_PAD,
    gap: KEY_GAP,
    width: "100%",
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  key: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15, 23, 42, 0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
      },
      android: { elevation: 2 },
    }),
  },
  backKey: {
    backgroundColor: "rgba(236, 253, 245, 0.98)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  keyPressed: {
    backgroundColor: "#F1F5F9",
    transform: [{ scale: 0.97 }],
  },
  keyDisabled: {
    opacity: 0.45,
  },
  digitText: {
    fontSize: 25,
    fontWeight: "600",
    color: "#0F172A",
    lineHeight: 28,
    includeFontPadding: false,
  },
  lettersText: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: "#94A3B8",
    includeFontPadding: false,
  },
});
