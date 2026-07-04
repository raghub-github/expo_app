import React, { useEffect, useRef, useState } from "react";
import { Text, StyleSheet } from "react-native";
import { StoreTheme } from "@/constants/storeTheme";

const TYPE_MS = 38;
const ERASE_MS = 20;
const HOLD_MS = 2200;
const REST_MS = 400;

type Props = {
  text: string;
};

type Phase = "type" | "hold" | "erase" | "rest";

/** Typewriter write → pause → erase loop for merchant loading copy. */
export function MerchantLoadingTypewriterText({ text }: Props) {
  const [display, setDisplay] = useState("");
  const [cursorOn, setCursorOn] = useState(true);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const blink = setInterval(() => setCursorOn((v) => !v), 520);
    return () => clearInterval(blink);
  }, []);

  useEffect(() => {
    const fullText = text.trim();
    if (!fullText) {
      setDisplay("");
      return;
    }

    let cancelled = false;
    let charIndex = 0;
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

    const tick = () => {
      if (cancelled) return;
      const currentText = textRef.current.trim();
      if (!currentText) return;

      if (phase === "type") {
        if (charIndex < currentText.length) {
          charIndex += 1;
          setDisplay(currentText.slice(0, charIndex));
          schedule(TYPE_MS);
          return;
        }
        phase = "hold";
        schedule(HOLD_MS);
        return;
      }

      if (phase === "hold") {
        phase = "erase";
        schedule(ERASE_MS);
        return;
      }

      if (phase === "erase") {
        if (charIndex > 0) {
          charIndex -= 1;
          setDisplay(currentText.slice(0, charIndex));
          schedule(ERASE_MS);
          return;
        }
        phase = "rest";
        schedule(REST_MS);
        return;
      }

      phase = "type";
      schedule(TYPE_MS);
    };

    charIndex = 0;
    phase = "type";
    setDisplay("");
    tick();

    return () => {
      cancelled = true;
      clear();
    };
  }, [text]);

  const cursor = cursorOn ? "|" : " ";

  return (
    <Text style={styles.text} accessibilityLiveRegion="polite" numberOfLines={3}>
      {display}
      <Text style={styles.cursor}>{cursor}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
    minHeight: 44,
    width: "100%",
  },
  cursor: {
    color: StoreTheme.textSecondary,
    fontWeight: "400",
  },
});
