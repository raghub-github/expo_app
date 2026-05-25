import { useCallback, useState } from "react";
import { Platform } from "react-native";
import type { OrderRecord } from "@/hooks/useOrders";
import { speakOrderItems } from "@/lib/orderCardActions";

export function useOrderSpeech() {
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback(
    async (order: OrderRecord) => {
      if (speaking) {
        if (Platform.OS === "web" && typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        } else {
          try {
            const Speech = await import("expo-speech");
            Speech.stop();
          } catch {
            /* optional */
          }
        }
        setSpeaking(false);
        return;
      }

      await speakOrderItems(order, {
        onStart: () => setSpeaking(true),
        onDone: () => setSpeaking(false),
      });
    },
    [speaking]
  );

  return { speaking, speak };
}
