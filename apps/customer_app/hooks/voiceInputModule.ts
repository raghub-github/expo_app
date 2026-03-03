/**
 * Safe loader for expo-speech-recognition.
 * We do not require the package here so the app never crashes when the
 * ExpoSpeechRecognition native module is missing (e.g. in Expo Go).
 * Voice input is disabled; re-enable by loading the module when using a
 * dev build that includes the native module.
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

/** No-op hook so we can always call the same number of hooks when module is unavailable. */
function noopHook(_event: string, _callback: (e: unknown) => void) {
  // no-op
}

let cached: SpeechModule | null = null;

function load(): SpeechModule | null {
  return cached;
}

export function getSpeechModule(): SpeechModule | null {
  return load();
}

export function getUseSpeechRecognitionEvent(): SpeechModule["useSpeechRecognitionEvent"] {
  return load()?.useSpeechRecognitionEvent ?? noopHook;
}

export function getExpoSpeechRecognitionModule(): SpeechModule["ExpoSpeechRecognitionModule"] | null {
  return load()?.ExpoSpeechRecognitionModule ?? null;
}
