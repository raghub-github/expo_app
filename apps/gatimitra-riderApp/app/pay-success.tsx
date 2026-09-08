/**
 * Deep-link landing for Razorpay hosted checkout success.
 * Avoids Unmatched ("This screen doesn't exist") and Index→login bounce.
 */
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";

export default function PaySuccessScreen() {
  useEffect(() => {
    const t = setTimeout(() => {
      router.replace("/(onboarding)/payment");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f4fbf6",
      }}
    >
      <ActivityIndicator color="#22a745" />
    </View>
  );
}
