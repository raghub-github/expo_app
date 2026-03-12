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
        "Logged out",
        "You have been logged out by the Owner. Please login again to access the app.",
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

