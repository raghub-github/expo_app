import { useEffect } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { onSessionRevoked } from "@/services/sessionEvents";

export function SessionRevokedGate() {
  const { signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onSessionRevoked(async () => {
      Alert.alert(
        "Session ended",
        "Your session has ended. Please sign in again to access the app.",
        [
          {
            text: "OK",
            onPress: async () => {
              await signOut();
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
  }, [signOut, router]);

  return null;
}

