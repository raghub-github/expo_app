/**
 * Offer strip ticker — wipe/erase between lines (loading + live offers).
 * Same cadence as merchant loading typewriter; no half-word glitches.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, StyleSheet, TouchableOpacity, View } from "react-native";
import { StoreTheme } from "@/constants/storeTheme";

const TYPE_MS = 28;
const ERASE_MS = 16;
const HOLD_MS = 2400;
const REST_MS = 280;

const DEFAULT_LOADING_LINES = [
  "Finding offers for you",
  "Checking best deals",
  "Loading savings",
];

type Phase = "type" | "hold" | "erase" | "rest";

type Props = {
  texts?: string[];
  loadingLines?: string[];
  onPress?: () => void;
};

export function OfferHoldEraseText({
  texts = [],
  loadingLines = DEFAULT_LOADING_LINES,
  onPress,
}: Props) {
  const lines = useMemo(() => {
    const fromOffers = texts.map((t) => t.trim()).filter(Boolean);
    if (fromOffers.length > 0) return fromOffers;
    return loadingLines.map((t) => t.trim()).filter(Boolean);
  }, [texts, loadingLines]);

  const linesKey = lines.join("\0");
  const [display, setDisplay] = useState("");
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    if (lines.length === 0) {
      setDisplay("");
      return;
    }

    // Single live offer — show full text, no loop.
    if (texts.length === 1 && lines.length === 1) {
      setDisplay(lines[0]!);
      return;
    }

    let cancelled = false;
    let lineIndex = 0;
    let charIndex = 0;
    let phase: Phase = "type";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let erasingSnapshot = "";

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

    const activeLines = () => linesRef.current.filter((l) => l.length > 0);

    const tick = () => {
      if (cancelled) return;
      const list = activeLines();
      if (list.length === 0) return;

      if (lineIndex >= list.length) lineIndex = 0;
      const text = list[lineIndex] ?? "";

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
        // One loading/offer line only — keep holding (no erase).
        if (list.length === 1 && texts.length > 0) return;
        erasingSnapshot = text;
        phase = "erase";
        schedule(ERASE_MS);
        return;
      }

      if (phase === "erase") {
        if (charIndex > 0) {
          charIndex -= 1;
          setDisplay(erasingSnapshot.slice(0, charIndex));
          schedule(ERASE_MS);
          return;
        }
        setDisplay("");
        lineIndex = (lineIndex + 1) % Math.max(1, activeLines().length);
        phase = "rest";
        schedule(REST_MS);
        return;
      }

      charIndex = 0;
      phase = "type";
      schedule(TYPE_MS);
    };

    charIndex = 0;
    lineIndex = 0;
    phase = "type";
    setDisplay("");
    schedule(TYPE_MS);

    return () => {
      cancelled = true;
      clear();
    };
  }, [linesKey, texts.length, lines.length]);

  if (lines.length === 0) return null;

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
