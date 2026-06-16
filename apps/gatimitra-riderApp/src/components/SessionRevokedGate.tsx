import { useEffect } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { onSessionRevoked } from "@/src/services/sessionEvents";
import { useSessionStore } from "@/src/stores/sessionStore";

export function SessionRevokedGate() {
  const setSession = useSessionStore((s) => s.setSession);

  useEffect(() => {
    const unsubscribe = onSessionRevoked(async (payload) => {
      await setSession(null);
      router.replace("/(auth)/login");
      Alert.alert(
        "Session ended",
        payload.reason === "invalid_token"
          ? "Your login has expired or is no longer valid. Please sign in again."
          : "Your session has ended. Please sign in again.",
        [{ text: "OK" }],
        { cancelable: false },
      );
    });

    return unsubscribe;
  }, [setSession]);

  return null;
}
