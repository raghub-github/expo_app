import { useEffect } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { onSessionRevoked } from "@/services/sessionEvents";
import { authTokenFingerprint } from "@/lib/merchantAuthLog";

export function SessionRevokedGate() {
  const { signOut, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onSessionRevoked(async (payload) => {
      // Old revoked callbacks must not destroy a newer login session.
      if (payload.tokenFingerprint && token) {
        const live = authTokenFingerprint(token);
        if (live && live !== payload.tokenFingerprint) {
          return;
        }
      }
      await signOut();
      Alert.alert(
        "Session ended",
        payload.reason === "invalid_token"
          ? "Your login has expired or is no longer valid for this server. Please sign in again."
          : "Your session has ended. Please sign in again to access the app.",
        [
          {
            text: "OK",
            onPress: () => {
              router.replace("/(auth)/login");
            },
          },
        ],
        { cancelable: false }
      );
    });

    return () => {
      unsubscribe();
    };
  }, [signOut, router, token]);

  return null;
}
