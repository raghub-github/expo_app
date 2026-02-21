/**
 * Safe loader for expo-speech-recognition.
 * In Expo Go the native module is missing; require() throws. We never require at top level
 * and catch any throw so the app runs and voice is just unavailable.
 */

export type SpeechModule = {
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => boolean;
    requestPermissionsAsync: () => Promise<{ granted: boolean }>;
    start: (opts: { lang: string; interimResults: boolean; continuous: boolean }) => Promise<void>;
    stop: () => void;
  };
  useSpeechRecognitionEvent: (event: string, callback: (e: unknown) => void) => void;
};

let cached: SpeechModule | null | undefined = undefined;

function load(): SpeechModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-speech-recognition") as SpeechModule;
    cached = mod;
  } catch (_e) {
    cached = null;
  }
  return cached;
}

function safeLoad(): SpeechModule | null {
  try {
    return load();
  } catch {
    cached = null;
    return null;
  }
}

export function getSpeechModule(): SpeechModule | null {
  return safeLoad();
}

/** No-op hook so we can always call the same number of hooks. */
function noopHook(_event: string, _callback: (e: unknown) => void) {
  // no-op
}

export function getUseSpeechRecognitionEvent(): SpeechModule["useSpeechRecognitionEvent"] {
  const mod = safeLoad();
  return mod ? mod.useSpeechRecognitionEvent : noopHook;
}

export function getExpoSpeechRecognitionModule(): SpeechModule["ExpoSpeechRecognitionModule"] | null {
  const mod = safeLoad();
  return mod ? mod.ExpoSpeechRecognitionModule : null;
}
