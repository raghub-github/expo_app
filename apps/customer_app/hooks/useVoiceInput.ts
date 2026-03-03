/**
 * Hook for voice-to-text input using expo-speech-recognition.
 * Safe in Expo Go: if the native module is missing, isAvailable is false and the app does not crash.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import {
  getExpoSpeechRecognitionModule,
  getUseSpeechRecognitionEvent,
} from "./voiceInputModule";

export interface UseVoiceInputOptions {
  /** Called when a final transcript is available (user finished speaking). */
  onTranscript?: (text: string) => void;
  /** Language code, e.g. "en-US". */
  lang?: string;
  /** If true, append to previous transcript; if false, replace. Default: false. */
  append?: boolean;
}

export interface UseVoiceInputReturn {
  /** Whether speech recognition is available on this device. */
  isAvailable: boolean;
  /** Whether the mic is currently listening. */
  isListening: boolean;
  /** Last error message, if any. */
  error: string | null;
  /** Start listening; requests permissions if needed. */
  startListening: () => Promise<void>;
  /** Stop listening. */
  stopListening: () => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onTranscript, lang = "en-US", append = false } = options;
  const [isAvailable, setIsAvailable] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState("");
  const sentFinalRef = useRef(false);

  const Module = getExpoSpeechRecognitionModule();
  const useSpeechRecognitionEvent = getUseSpeechRecognitionEvent();

  useEffect(() => {
    let mounted = true;
    if (!Module) {
      setIsAvailable(false);
      // Re-check after deferred load may have run (dev client with native module)
      const t = setTimeout(() => {
        if (!mounted) return;
        const M = getExpoSpeechRecognitionModule();
        if (M) {
          try {
            setIsAvailable(!!M.isRecognitionAvailable());
          } catch {
            setIsAvailable(false);
          }
        }
      }, 300);
      return () => {
        mounted = false;
        clearTimeout(t);
      };
    }
    try {
      const available = Module.isRecognitionAvailable();
      if (mounted) setIsAvailable(!!available);
    } catch {
      if (mounted) setIsAvailable(false);
    }
    return () => {
      mounted = false;
    };
  }, [Module]);

  useSpeechRecognitionEvent("start", () => {
    setError(null);
    setInterimTranscript("");
    sentFinalRef.current = false;
    setIsListening(true);
  });

  useSpeechRecognitionEvent("end", () => {
    setInterimTranscript((prev) => {
      if (!sentFinalRef.current && prev.trim()) {
        onTranscript?.(prev.trim());
        sentFinalRef.current = true;
      }
      return "";
    });
    setIsListening(false);
  });

  useSpeechRecognitionEvent("result", (event: unknown) => {
    const e = event as { results?: { transcript?: string }[]; isFinal?: boolean };
    const transcript = e.results?.[0]?.transcript?.trim() ?? "";
    if (!transcript) return;
    if (e.isFinal) {
      sentFinalRef.current = true;
      onTranscript?.(transcript);
      setInterimTranscript("");
    } else {
      setInterimTranscript(transcript);
    }
  });

  useSpeechRecognitionEvent("error", (event: unknown) => {
    const e = event as { error?: string; message?: string };
    setIsListening(false);
    const msg = e.message || e.error || "Speech recognition error";
    setError(msg);
    if (e.error === "not-allowed") {
      setError("Microphone permission denied");
    }
  });

  const startListening = useCallback(async () => {
    if (!Module || !isAvailable) {
      setError("Voice input is not available on this device.");
      return;
    }
    setError(null);
    try {
      const result = await Module.requestPermissionsAsync();
      if (!result.granted) {
        setError("Microphone permission is required for voice search.");
        return;
      }
      await Module.start({
        lang,
        interimResults: true,
        continuous: false,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start voice input";
      setError(message);
    }
  }, [Module, isAvailable, lang]);

  const stopListening = useCallback(() => {
    if (!Module) return;
    try {
      Module.stop();
    } catch {
      // ignore
    }
  }, [Module]);

  return {
    isAvailable,
    isListening,
    error,
    startListening,
    stopListening,
  };
}
