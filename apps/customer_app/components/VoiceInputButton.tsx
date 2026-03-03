/**
 * Mic button that starts voice input and feeds transcript into a text value.
 * Use next to a TextInput; onTranscript is called with the spoken text.
 */

import { TouchableOpacity, StyleSheet, ActivityIndicator, ViewStyle } from "react-native";
import { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useVoiceInput } from "@/hooks/useVoiceInput";

const TITLE_DARK = "#1A1A1A";
const TEAL = "#14b8a6";
const RED = "#dc2626";

export interface VoiceInputButtonProps {
  /** Called with the recognized text (replace or append in parent). */
  onTranscript: (text: string) => void;
  /** Icon color when idle. */
  color?: string;
  /** Icon size. */
  size?: number;
  /** Optional style. */
  style?: ViewStyle;
  /** If true, append to existing value; otherwise parent typically replaces. */
  append?: boolean;
  /** If true, start listening as soon as the button is mounted (e.g. open search with voice). */
  autoStart?: boolean;
}

export function VoiceInputButton({
  onTranscript,
  color = TITLE_DARK,
  size = 22,
  style,
  append = false,
  autoStart = false,
}: VoiceInputButtonProps) {
  const { isAvailable, isListening, error, startListening, stopListening } = useVoiceInput({
    onTranscript,
    append,
  });

  useEffect(() => {
    if (autoStart && isAvailable && !isListening) {
      const t = setTimeout(() => startListening(), 300);
      return () => clearTimeout(t);
    }
  }, [autoStart, isAvailable]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAvailable) {
    return null;
  }

  const handlePress = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.btn, style]}
      activeOpacity={0.7}
      accessibilityLabel={isListening ? "Stop listening" : "Speak to type"}
      accessibilityRole="button"
    >
      {isListening ? (
        <ActivityIndicator size="small" color={TEAL} />
      ) : (
        <Ionicons
          name="mic-outline"
          size={size}
          color={error ? RED : color}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    padding: 4,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
