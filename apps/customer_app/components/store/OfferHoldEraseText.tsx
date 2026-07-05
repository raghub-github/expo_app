import React, { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, TouchableOpacity, View } from "react-native";
import { StoreTheme } from "@/constants/storeTheme";

const TYPE_MS = 28;
const ERASE_MS = 16;
const HOLD_MS = 2400;

const DEFAULT_LOADING_LINES = [
  "Finding offers for you",
  "Checking best deals",
  "Loading savings",
];

type Phase = "type" | "hold" | "erase";

type Props = {
  texts?: string[];
  loadingLines?: string[];
  onPress?: () => void;
};

/** Type → hold → erase loop so the offer strip never looks blank while offers warm up. */
export function OfferHoldEraseText({
  texts = [],
  loadingLines = DEFAULT_LOADING_LINES,
  onPress,
}: Props) {
  const lines = texts.length > 0 ? texts : loadingLines;
  const singleLine = lines.length === 1;
  const [display, setDisplay] = useState("");
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    const activeLines = linesRef.current.filter((line) => line.trim().length > 0);
    if (activeLines.length === 0) return;

    let cancelled = false;
    let charIndex = 0;
    let currentLine = 0;
    let phase: Phase = "type";
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clear = () => {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (delay: number) => {
      clear();
      timer = setTimeout(tick, delay);
    };

    const currentText = () => activeLines[currentLine]?.trim() ?? "";

    const tick = () => {
      if (cancelled) return;
      const text = currentText();
      if (!text) return;

      if (phase === "type") {
        if (charIndex < text.length) {
          charIndex += 1;
          setDisplay(text.slice(0, charIndex));
          schedule(TYPE_MS);
          return;
        }
        phase = "hold";
        schedule(HOLD_MS);
        return;
      }

      if (phase === "hold") {
        if (singleLine && texts.length > 0) return;
        phase = "erase";
        schedule(ERASE_MS);
        return;
      }

      if (phase === "erase") {
        if (charIndex > 0) {
          charIndex -= 1;
          setDisplay(text.slice(0, charIndex));
          schedule(ERASE_MS);
          return;
        }
        currentLine = (currentLine + 1) % activeLines.length;
        charIndex = 0;
        phase = "type";
        schedule(TYPE_MS);
        return;
      }
    };

    charIndex = 0;
    currentLine = 0;
    phase = "type";
    tick();

    return () => {
      cancelled = true;
      clear();
    };
  }, [lines.join("|"), singleLine, texts.length]);

  const body = (
    <Text style={styles.text} numberOfLines={1} accessibilityLiveRegion="polite">
      {display}
    </Text>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.wrap} onPress={onPress} activeOpacity={0.7}>
        {body}
      </TouchableOpacity>
    );
  }

  return <View style={styles.wrap}>{body}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    minHeight: 18,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
});
