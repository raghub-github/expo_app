import { useCallback, useEffect, useRef, useState } from "react";
import type { OrderRecord } from "@/hooks/useOrders";
import {
  isOrderSpeechActive,
  speakOrderItems,
  stopOrderSpeech,
  warmupOrderSpeech,
} from "@/lib/orderCardActions";

export function useOrderSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    warmupOrderSpeech();
    return () => {
      mounted.current = false;
    };
  }, []);

  const speak = useCallback(
    async (order: OrderRecord) => {
      if (speaking) {
        // The engine can end an utterance without reporting it, which used to
        // leave this stuck "speaking" and swallow every later tap.
        const reallySpeaking = await isOrderSpeechActive();
        await stopOrderSpeech();
        if (mounted.current) setSpeaking(false);
        if (reallySpeaking) return;
      }

      await speakOrderItems(order, {
        onStart: () => {
          if (mounted.current) setSpeaking(true);
        },
        onDone: () => {
          if (mounted.current) setSpeaking(false);
        },
      });
    },
    [speaking]
  );

  return { speaking, speak };
}
